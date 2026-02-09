/**
 * Commit Extension - autonomous git commit using session branching
 *
 * Uses the session-branching pattern from review.ts. The /commit command
 * creates a new session branch where the model runs with full tool access
 * to gather context, generate a commit message, and execute the commit
 * autonomously.
 *
 * Usage:
 *   /commit [optional instructions] - Start a commit session
 *   /end-commit                     - Return to original session
 */

import type {
    ExtensionAPI,
    ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import type { Model, Api } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";

// --- Model fallback chain ---

const MODEL_CANDIDATES: Array<{ provider: string; modelId: string }> = [
    { provider: "google-gemini-cli", modelId: "gemini-3-flash-preview" },
    { provider: "github-copilot", modelId: "gpt-5.1-codex-mini" },
    { provider: "anthropic", modelId: "claude-haiku-4-5" },
];

// --- State ---

const COMMIT_STATE_TYPE = "commit-session";

type CommitSessionState = {
    active: boolean;
    originId?: string;
    originalModel?: {
        provider: string;
        modelId: string;
    };
};

// Module-level state (runtime cache)
let commitOriginId: string | undefined;
let commitOriginalModel: Model<any> | undefined;

// --- Widget ---

function setCommitWidget(ctx: ExtensionContext, active: boolean) {
    if (!ctx.hasUI) return;
    if (!active) {
        ctx.ui.setWidget("commit", undefined);
        return;
    }

    ctx.ui.setWidget("commit", (_tui, theme) => {
        const text = new Text(
            theme.fg(
                "warning",
                "Commit session active, return with /end-commit",
            ),
            0,
            0,
        );
        return {
            render(width: number) {
                return text.render(width);
            },
            invalidate() {
                text.invalidate();
            },
        };
    });
}

// --- Persisted state helpers ---

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

        // Restore original model from persisted state
        if (state.originalModel) {
            const model = ctx.modelRegistry.find(
                state.originalModel.provider,
                state.originalModel.modelId,
            );
            if (model) {
                commitOriginalModel = model;
            }
        }

        setCommitWidget(ctx, true);
        return;
    }

    commitOriginId = undefined;
    commitOriginalModel = undefined;
    setCommitWidget(ctx, false);
}

// --- Model selection ---

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

// --- Extension entry point ---

export default function commitExtension(pi: ExtensionAPI) {
    // Lifecycle events: restore state on session changes
    pi.on("session_start", (_event, ctx) => {
        applyCommitState(ctx);
    });

    pi.on("session_switch", (_event, ctx) => {
        applyCommitState(ctx);
    });

    pi.on("session_tree", (_event, ctx) => {
        applyCommitState(ctx);
    });

    // --- /commit command ---

    pi.registerCommand("commit", {
        description:
            "Start an autonomous commit session (model commits with full tool access)",
        handler: async (args, ctx) => {
            if (!ctx.hasUI) {
                ctx.ui.notify("commit requires interactive mode", "error");
                return;
            }

            // Check if we're already in a commit session
            const existingState = getCommitState(ctx);
            if (commitOriginId || existingState?.active) {
                ctx.ui.notify(
                    "Already in a commit session. Use /end-commit to finish first.",
                    "warning",
                );
                return;
            }

            // Check if we're in a git repository
            const { code: gitCode } = await pi.exec("git", [
                "rev-parse",
                "--git-dir",
            ]);
            if (gitCode !== 0) {
                ctx.ui.notify("Not a git repository", "error");
                return;
            }

            // Detect staged vs uncommitted mode
            const { stdout: stagedStat } = await pi.exec("git", [
                "diff",
                "--cached",
                "--stat",
            ]);
            const hasStagedChanges = stagedStat.trim().length > 0;

            let mode: "staged" | "uncommitted";
            if (hasStagedChanges) {
                mode = "staged";
            } else {
                // Check if there are any uncommitted changes at all
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

            // Determine if we need a fresh session branch
            const entries = ctx.sessionManager.getEntries();
            const messageCount = entries.filter(
                (e) => e.type === "message",
            ).length;

            let useFreshSession = false;

            if (messageCount > 0) {
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

            // Select commit model
            const commitModel = await selectCommitModel(ctx);
            if (!commitModel) {
                ctx.ui.notify("No model available", "error");
                return;
            }

            // Store original model before switching
            const originalModel = ctx.model;
            commitOriginalModel = originalModel;

            // Persist original model info for restoration
            const originalModelInfo = originalModel
                ? {
                      provider: originalModel.provider,
                      modelId: originalModel.id,
                  }
                : undefined;

            if (useFreshSession) {
                // Store current position
                const originId = ctx.sessionManager.getLeafId() ?? undefined;
                if (!originId) {
                    ctx.ui.notify(
                        "Failed to determine origin. Try again from a session with messages.",
                        "error",
                    );
                    return;
                }
                commitOriginId = originId;

                // Keep a local copy so session_tree events don't wipe it
                const lockedOriginId = originId;

                // Find the first user message
                const firstUserMessage = entries.find(
                    (e) => e.type === "message" && e.message.role === "user",
                );

                if (!firstUserMessage) {
                    ctx.ui.notify(
                        "No user message found in session",
                        "error",
                    );
                    commitOriginId = undefined;
                    commitOriginalModel = undefined;
                    return;
                }

                // Navigate to create a new branch
                try {
                    const result = await ctx.navigateTree(
                        firstUserMessage.id,
                        {
                            summarize: false,
                            label: "commit",
                        },
                    );
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

                // Restore origin after navigation events
                commitOriginId = lockedOriginId;

                // Clear the editor
                ctx.ui.setEditorText("");
            }

            // Show widget and persist state (both branched and non-branched modes)
            setCommitWidget(ctx, true);
            pi.appendEntry(COMMIT_STATE_TYPE, {
                active: true,
                originId: commitOriginId,
                originalModel: originalModelInfo,
            } satisfies CommitSessionState);

            // Switch to commit model
            await pi.setModel(commitModel);

            // Build prompt
            const modeDescription =
                mode === "staged"
                    ? "staged changes only"
                    : "all uncommitted changes";

            let prompt = `You are performing a git commit. Commit ${modeDescription} autonomously — do not ask for confirmation.`;

            if (args?.trim()) {
                prompt += `\n\nAdditional instructions: ${args.trim()}`;
            }

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

1. Run \`git status\` and \`git diff --cached\`${mode === "uncommitted" ? " (and `git diff` for unstaged changes)" : ""} to understand the changes
2. Generate an appropriate commit message
${mode === "uncommitted" ? "3. Stage the changes with `git add -A`\n4" : "3"}. Execute \`git commit -m "<message>"\``;

            const modeHint =
                mode === "staged" ? "staged changes" : "all uncommitted changes";
            ctx.ui.notify(
                `Starting commit session (${modeHint}) using ${commitModel.id}`,
                "info",
            );

            // Send the prompt — model runs autonomously with full tool access
            pi.sendUserMessage(prompt);
        },
    });

    // --- /end-commit command ---

    pi.registerCommand("end-commit", {
        description: "End commit session and return to original position",
        handler: async (_args, ctx) => {
            if (!ctx.hasUI) {
                ctx.ui.notify(
                    "end-commit requires interactive mode",
                    "error",
                );
                return;
            }

            // Gather state from module-level cache and persisted entries
            // BEFORE navigating, since persisted state lives on the commit branch
            let originId = commitOriginId;
            let originalModel = commitOriginalModel;

            // If module-level state is incomplete, try persisted state
            if (!originalModel) {
                const state = getCommitState(ctx);
                if (state?.active) {
                    if (!originId && state.originId) {
                        originId = state.originId;
                    }
                    if (state.originalModel) {
                        const model = ctx.modelRegistry.find(
                            state.originalModel.provider,
                            state.originalModel.modelId,
                        );
                        if (model) {
                            originalModel = model;
                        }
                    }
                }
            }

            // Check if we're actually in a commit session
            if (!originId && !originalModel) {
                const state = getCommitState(ctx);
                if (!state?.active) {
                    ctx.ui.notify(
                        "Not in a commit session (use /commit first)",
                        "info",
                    );
                    return;
                }
            }

            // Navigate back if we branched (originId exists)
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

            // Clear state
            setCommitWidget(ctx, false);
            commitOriginId = undefined;
            commitOriginalModel = undefined;
            pi.appendEntry(COMMIT_STATE_TYPE, {
                active: false,
            } satisfies CommitSessionState);

            // Restore original model
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
