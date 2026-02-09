/**
 * Commit Extension - autonomous git commit using session branching
 *
 * /commit [instructions]  - branch session, switch to cheap model, commit autonomously
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

function setCommitWidget(ctx: ExtensionContext, active: boolean) {
    if (!ctx.hasUI) return;
    if (!active) {
        ctx.ui.setWidget("commit", undefined);
        return;
    }
    ctx.ui.setWidget("commit", (_tui, theme) => {
        const text = new Text(
            theme.fg("warning", "Commit session active, return with /end-commit"),
            0, 0,
        );
        return {
            render: (width: number) => text.render(width),
            invalidate: () => text.invalidate(),
        };
    });
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
    const state = getCommitState(ctx);
    if (state?.active) {
        commitOriginId = state.originId;
        commitOriginalModel = resolveModel(ctx, state.originalModel);
        setCommitWidget(ctx, true);
    } else {
        commitOriginId = undefined;
        commitOriginalModel = undefined;
        setCommitWidget(ctx, false);
    }
}

async function selectCommitModel(
    ctx: ExtensionContext,
): Promise<Model<Api> | undefined> {
    for (const candidate of MODEL_CANDIDATES) {
        const model = ctx.modelRegistry.find(candidate.provider, candidate.modelId);
        if (model) {
            const apiKey = await ctx.modelRegistry.getApiKey(model);
            if (apiKey) return model;
        }
    }
    return ctx.model;
}

function buildPrompt(mode: "staged" | "uncommitted", args: string): string {
    const modeDescription =
        mode === "staged" ? "staged changes only" : "all uncommitted changes";

    let prompt = `You are performing a git commit. Commit ${modeDescription} autonomously — do not ask for confirmation.`;

    if (args.trim()) {
        prompt += `\n\nAdditional instructions: ${args.trim()}`;
    }

    const steps = [
        `Run \`git status\` and \`git diff --cached\`${mode === "uncommitted" ? " (and `git diff` for unstaged changes)" : ""} to understand the changes`,
        "Generate an appropriate commit message",
    ];
    if (mode === "uncommitted") {
        steps.push("Stage the changes with `git add -A`");
    }
    steps.push('Execute `git commit -m "<message>"`');

    prompt += `

## Commit Message Guidelines

Use conventional commit format: \`type(scope): subject\`

Common types: feat, fix, refactor, perf, docs, test, chore, style

Guidelines:
- Keep subject line under 72 characters
- For simple changes, only the subject line is sufficient
- Add a body when changes involve multiple files or need explanation
- Limit body to 3-5 bullet points for most commits
- No extra blank lines between bullet points

## Steps

${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;

    return prompt;
}

export default function commitExtension(pi: ExtensionAPI) {
    pi.on("session_start", (_event, ctx) => applyCommitState(ctx));
    pi.on("session_switch", (_event, ctx) => applyCommitState(ctx));
    pi.on("session_tree", (_event, ctx) => applyCommitState(ctx));

    pi.registerCommand("commit", {
        description: "Start an autonomous commit session (model commits with full tool access)",
        handler: async (args, ctx) => {
            if (!ctx.hasUI) {
                ctx.ui.notify("commit requires interactive mode", "error");
                return;
            }

            if (commitOriginId || getCommitState(ctx)?.active) {
                ctx.ui.notify(
                    "Already in a commit session. Use /end-commit to finish first.",
                    "warning",
                );
                return;
            }

            const { code: gitCode } = await pi.exec("git", ["rev-parse", "--git-dir"]);
            if (gitCode !== 0) {
                ctx.ui.notify("Not a git repository", "error");
                return;
            }

            // Detect staged vs uncommitted
            const { stdout: stagedStat } = await pi.exec("git", ["diff", "--cached", "--stat"]);
            let mode: "staged" | "uncommitted";
            if (stagedStat.trim()) {
                mode = "staged";
            } else {
                const { stdout: statusOutput } = await pi.exec("git", ["status", "--porcelain"]);
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

            const commitModel = await selectCommitModel(ctx);
            if (!commitModel) {
                ctx.ui.notify("No model available", "error");
                return;
            }

            const originalModel = ctx.model;
            commitOriginalModel = originalModel;

            if (useFreshSession) {
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
                    commitOriginId = undefined;
                    commitOriginalModel = undefined;
                    return;
                }

                try {
                    const result = await ctx.navigateTree(firstUserMessage.id, {
                        summarize: false,
                        label: "commit",
                    });
                    if (result.cancelled) {
                        commitOriginId = undefined;
                        commitOriginalModel = undefined;
                        return;
                    }
                } catch (error) {
                    commitOriginId = undefined;
                    commitOriginalModel = undefined;
                    ctx.ui.notify(
                        `Failed to start commit session: ${error instanceof Error ? error.message : String(error)}`,
                        "error",
                    );
                    return;
                }

                // Restore origin — session_tree events during navigation may have cleared it
                commitOriginId = originId;
                ctx.ui.setEditorText("");
            }

            setCommitWidget(ctx, true);
            pi.appendEntry(COMMIT_STATE_TYPE, {
                active: true,
                originId: commitOriginId,
                originalModel: originalModel
                    ? { provider: originalModel.provider, modelId: originalModel.id }
                    : undefined,
            } satisfies CommitSessionState);

            await pi.setModel(commitModel);

            const modeLabel = mode === "staged" ? "staged changes" : "all uncommitted changes";
            ctx.ui.notify(`Starting commit session (${modeLabel}) using ${commitModel.id}`, "info");
            pi.sendUserMessage(buildPrompt(mode, args));
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
                    ctx.ui.notify("Not in a commit session (use /commit first)", "info");
                    return;
                }
            }

            if (originId) {
                try {
                    const result = await ctx.navigateTree(originId, { summarize: false });
                    if (result.cancelled) {
                        ctx.ui.notify("Navigation cancelled. Use /end-commit to try again.", "info");
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

            setCommitWidget(ctx, false);
            commitOriginId = undefined;
            commitOriginalModel = undefined;
            pi.appendEntry(COMMIT_STATE_TYPE, { active: false } satisfies CommitSessionState);

            if (originalModel) {
                await pi.setModel(originalModel);
            }

            ctx.ui.notify("Commit session ended. Returned to original position.", "info");
        },
    });
}
