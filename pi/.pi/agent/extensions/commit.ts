/**
 * Commit Extension - autonomous git commit using session branching
 *
 * /commit [instructions]  - commit autonomously (branches use cheap model, current session keeps active model)
 * /end-commit             - return to original session and restore model
 */

import type {
    ExtensionAPI,
    ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import type { Model, Api } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";

const MODEL_CANDIDATES: Array<{ provider: string; modelId: string }> = [
    { provider: "google-gemini-cli", modelId: "gemini-3-flash-preview" },
    { provider: "github-copilot", modelId: "gpt-5.1-codex-mini" },
    { provider: "anthropic", modelId: "claude-haiku-4-5" },
];

const COMMIT_STATE_TYPE = "commit-session";

type CommitSessionState = {
    active: boolean;
    originId?: string;
    originalModel?: { provider: string; modelId: string };
};

// Module-level state (runtime cache, restored from persisted state on lifecycle events)
let commitOriginId: string | undefined;
let commitOriginalModel: Model<any> | undefined;
let commitInCurrentSession = false;

function resetCommitState() {
    commitOriginId = undefined;
    commitOriginalModel = undefined;
    commitInCurrentSession = false;
}

function setCommitWidget(ctx: ExtensionContext, active: boolean) {
    if (!ctx.hasUI) return;
    ctx.ui.setWidget(
        "commit",
        active
            ? (_tui, theme) => {
                  const text = new Text(
                      theme.fg(
                          "warning",
                          "Commit session active, return with /end-commit",
                      ),
                      0,
                      0,
                  );
                  return {
                      render: (width: number) => text.render(width),
                      invalidate: () => text.invalidate(),
                  };
              }
            : undefined,
    );
}

function resolveModel(
    ctx: ExtensionContext,
    info?: { provider: string; modelId: string },
): Model<any> | undefined {
    if (!info) return undefined;
    return ctx.modelRegistry.find(info.provider, info.modelId);
}

function getCommitState(ctx: ExtensionContext): CommitSessionState | undefined {
    let state: CommitSessionState | undefined;
    for (const entry of ctx.sessionManager.getBranch()) {
        if (entry.type === "custom" && entry.customType === COMMIT_STATE_TYPE) {
            state = entry.data as CommitSessionState | undefined;
        }
    }
    return state;
}

function applyCommitState(ctx: ExtensionContext) {
    resetCommitState();
    const state = getCommitState(ctx);
    if (state?.active) {
        commitOriginId = state.originId;
        commitOriginalModel = resolveModel(ctx, state.originalModel);
    }
    setCommitWidget(ctx, !!state?.active);
}

async function selectCommitModel(
    ctx: ExtensionContext,
): Promise<Model<Api> | undefined> {
    for (const candidate of MODEL_CANDIDATES) {
        const model = ctx.modelRegistry.find(
            candidate.provider,
            candidate.modelId,
        );
        if (model) {
            const apiKey = await ctx.modelRegistry.getApiKey(model);
            if (apiKey) return model;
        }
    }
    return ctx.model;
}

type GitContext = {
    status: string;
    diff: string;
    branch: string;
    log: string;
};

async function gatherGitContext(
    pi: ExtensionAPI,
    mode: "staged" | "uncommitted",
): Promise<GitContext | null> {
    const diffArgs = mode === "staged" ? ["diff", "--cached"] : ["diff"];
    const [status, diff, branch, log] = await Promise.all([
        pi.exec("git", ["status"]),
        pi.exec("git", diffArgs),
        pi.exec("git", ["branch", "--show-current"]),
        pi.exec("git", ["log", "--oneline", "-10"]),
    ]);
    if (status.code !== 0) return null;
    return {
        status: status.stdout,
        diff: diff.stdout,
        branch: branch.stdout.trim(),
        log: log.stdout,
    };
}

function buildPrompt(
    mode: "staged" | "uncommitted",
    args: string,
    gitContext: GitContext,
): string {
    const modeDescription =
        mode === "staged" ? "staged changes only" : "all uncommitted changes";
    const instructions = args.trim()
        ? `\n\nAdditional instructions: ${args.trim()}`
        : "";

    return `You are performing a git commit. Commit ${modeDescription} autonomously — do not ask for confirmation.${instructions}

## Git Context

### git status
\`\`\`
${gitContext.status}
\`\`\`

### git diff${mode === "staged" ? " --cached" : ""}
\`\`\`
${gitContext.diff}
\`\`\`

### Branch
${gitContext.branch}

### Recent log
\`\`\`
${gitContext.log}
\`\`\`

## Commit Message Guidelines

Use conventional commit format: \`type(scope): subject\`

Common types: feat, fix, refactor, perf, docs, test, chore, style

Guidelines:
- Keep subject line under 72 characters
- For simple changes, only the subject line is sufficient
- Add a body when changes involve multiple files or need explanation
- Limit body to 3-5 bullet points for most commits
- No extra blank lines between bullet points

## When to Include WHY (Not Just WHAT)

Include reasoning only when:
- Security implications exist
- Performance trade-offs were made
- The change fixes a non-obvious bug
- Breaking changes or migration steps are needed
- The approach chosen could be confusing without context

Otherwise, focus on describing WHAT changed concisely.

## Steps

${mode === "uncommitted" ? "1. Stage the changes with `git add -A`\n2" : "1"}. Execute \`git commit -m "<message>"\`

Do not output any text or explanation. Only use tools.`;
}

export default function commitExtension(pi: ExtensionAPI) {
    pi.on("session_start", (_event, ctx) => applyCommitState(ctx));
    pi.on("session_switch", (_event, ctx) => applyCommitState(ctx));
    pi.on("session_tree", (_event, ctx) => applyCommitState(ctx));

    pi.on("agent_end", async (_event, _ctx) => {
        if (!commitInCurrentSession) return;
        resetCommitState();
    });

    pi.registerCommand("commit", {
        description:
            "Autonomous git commit (uses fast model in branch, current model in session)",
        handler: async (args, ctx) => {
            if (!ctx.hasUI) {
                ctx.ui.notify("commit requires interactive mode", "error");
                return;
            }

            if (
                commitInCurrentSession ||
                commitOriginId ||
                getCommitState(ctx)?.active
            ) {
                ctx.ui.notify(
                    "Already in a commit session." +
                        (commitOriginId
                            ? " Use /end-commit to finish first."
                            : ""),
                    "warning",
                );
                return;
            }

            const { code: gitCode } = await pi.exec("git", [
                "rev-parse",
                "--git-dir",
            ]);
            if (gitCode !== 0) {
                ctx.ui.notify("Not a git repository", "error");
                return;
            }

            // Detect staged vs uncommitted
            const { stdout: stagedStat } = await pi.exec("git", [
                "diff",
                "--cached",
                "--stat",
            ]);
            let mode: "staged" | "uncommitted";
            if (stagedStat.trim()) {
                mode = "staged";
            } else {
                const { stdout: statusOutput } = await pi.exec("git", [
                    "status",
                    "--porcelain",
                ]);
                if (!statusOutput.trim()) {
                    ctx.ui.notify("No changes to commit", "info");
                    return;
                }
                mode = "uncommitted";
            }

            // Branch picker (only when session has messages)
            const entries = ctx.sessionManager.getEntries();
            const hasMessages = entries.some((e) => e.type === "message");
            let useFreshSession = false;

            if (hasMessages) {
                const choice = await ctx.ui.select("Start commit in:", [
                    "Empty branch",
                    "Current session",
                ]);
                if (choice === undefined) {
                    ctx.ui.notify("Commit cancelled", "info");
                    return;
                }
                useFreshSession = choice === "Empty branch";
            }

            if (useFreshSession) {
                const commitModel = await selectCommitModel(ctx);
                if (!commitModel) {
                    ctx.ui.notify("No model available", "error");
                    return;
                }
                const originalModel = ctx.model;
                commitOriginalModel = originalModel;
                const originId = ctx.sessionManager.getLeafId() ?? undefined;
                if (!originId) {
                    ctx.ui.notify("Failed to determine origin", "error");
                    return;
                }
                commitOriginId = originId;

                const firstUserMessage = entries.find(
                    (e) => e.type === "message" && e.message.role === "user",
                );
                if (!firstUserMessage) {
                    ctx.ui.notify("No user message found in session", "error");
                    resetCommitState();
                    return;
                }

                try {
                    const result = await ctx.navigateTree(firstUserMessage.id, {
                        summarize: false,
                        label: "commit",
                    });
                    if (result.cancelled) {
                        resetCommitState();
                        return;
                    }
                } catch (error) {
                    resetCommitState();
                    ctx.ui.notify(
                        `Failed to start commit session: ${error instanceof Error ? error.message : String(error)}`,
                        "error",
                    );
                    return;
                }

                // Restore origin — session_tree events during navigation may have cleared it
                commitOriginId = originId;
                ctx.ui.setEditorText("");
                setCommitWidget(ctx, true);
                pi.appendEntry(COMMIT_STATE_TYPE, {
                    active: true,
                    originId: commitOriginId,
                    originalModel: originalModel
                        ? {
                              provider: originalModel.provider,
                              modelId: originalModel.id,
                          }
                        : undefined,
                } satisfies CommitSessionState);
                await pi.setModel(commitModel);
            } else {
                commitInCurrentSession = true;
            }

            const gitContext = await gatherGitContext(pi, mode);
            if (!gitContext) {
                ctx.ui.notify("Failed to gather git context", "error");
                return;
            }

            const modeLabel =
                mode === "staged"
                    ? "staged changes"
                    : "all uncommitted changes";
            ctx.ui.notify(
                `Starting commit (${modeLabel})`,
                "info",
            );
            pi.sendUserMessage(buildPrompt(mode, args, gitContext));
        },
    });

    pi.registerCommand("end-commit", {
        description: "End commit session and return to original position",
        handler: async (_args, ctx) => {
            if (!ctx.hasUI) {
                ctx.ui.notify("end-commit requires interactive mode", "error");
                return;
            }

            // Gather state from module-level cache, falling back to persisted state.
            // Must read BEFORE navigating — persisted entries live on the commit branch.
            let originId = commitOriginId;
            let originalModel = commitOriginalModel;

            if (!originalModel || !originId) {
                const state = getCommitState(ctx);
                if (state?.active) {
                    originId ??= state.originId;
                    originalModel ??= resolveModel(ctx, state.originalModel);
                } else if (!originId && !originalModel) {
                    ctx.ui.notify(
                        "Not in a commit session (use /commit first)",
                        "info",
                    );
                    return;
                }
            }

            if (originId) {
                try {
                    const result = await ctx.navigateTree(originId, {
                        summarize: false,
                    });
                    if (result.cancelled) {
                        ctx.ui.notify(
                            "Navigation cancelled. Use /end-commit to try again.",
                            "info",
                        );
                        return;
                    }
                } catch (error) {
                    ctx.ui.notify(
                        `Failed to return: ${error instanceof Error ? error.message : String(error)}`,
                        "error",
                    );
                    return;
                }
            }

            resetCommitState();
            setCommitWidget(ctx, false);
            pi.appendEntry(COMMIT_STATE_TYPE, {
                active: false,
            } satisfies CommitSessionState);

            if (originalModel) {
                await pi.setModel(originalModel);
            }

            ctx.ui.notify(
                "Commit session ended. Returned to original position.",
                "info",
            );
        },
    });
}
