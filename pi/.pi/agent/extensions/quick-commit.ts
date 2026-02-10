/**
 * Quick Commit extension - generate and execute git commits using a separate model
 *
 * Command:
 *   /quick-commit [instructions] - Commit staged changes with a generated message
 *
 * The model runs in its own context via complete(), so it doesn't consume
 * tokens from the main session. The extension gathers git context itself,
 * asks the model for a commit message, lets you review/edit it, then commits.
 */

import {
    complete,
    type Model,
    type Api,
    type UserMessage,
} from "@mariozechner/pi-ai";
import type {
    ExtensionAPI,
    ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { BorderedLoader } from "@mariozechner/pi-coding-agent";

// --- Model fallback chain (edit these to change preference) ---

const GEMINI_MODEL_ID = "gemini-3-flash-preview";
const CODEX_MODEL_ID = "gpt-5.1-codex-mini";
const HAIKU_MODEL_ID = "claude-haiku-4-5";

const MODEL_CANDIDATES: Array<{ provider: string; modelId: string }> = [
    { provider: "google-gemini-cli", modelId: GEMINI_MODEL_ID },
    { provider: "github-copilot", modelId: CODEX_MODEL_ID },
    { provider: "anthropic", modelId: HAIKU_MODEL_ID },
];

// --- System prompt ---

const SYSTEM_PROMPT = `You are a git commit message generator. You will receive the output of git status, git diff, git branch, and recent git log.

Output ONLY the raw commit message text. No markdown formatting, no code fences, no preamble, no explanation.

## Commit Message Format

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

## Examples

feat(auth): add OAuth2 authentication support

- Implement OAuth2 provider integration
- Add token refresh mechanism
- Create middleware for protected routes

fix(api): prevent null pointer in user lookup

Handle case where user ID doesn't exist in database

refactor(payments): extract Stripe logic into service layer

- Move API calls to PaymentService
- Simplify controller methods
- Add error handling helpers

perf(search): add caching layer for search queries

Reduces average query time from 200ms to 15ms`;

// --- Helpers ---

async function selectModel(
    currentModel: Model<Api>,
    modelRegistry: {
        find: (provider: string, modelId: string) => Model<Api> | undefined;
        getApiKey: (model: Model<Api>) => Promise<string | undefined>;
    },
): Promise<Model<Api>> {
    for (const candidate of MODEL_CANDIDATES) {
        const model = modelRegistry.find(candidate.provider, candidate.modelId);
        if (model) {
            const apiKey = await modelRegistry.getApiKey(model);
            if (apiKey) return model;
        }
    }
    return currentModel;
}

async function runGit(
    pi: ExtensionAPI,
    args: string[],
    signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string; code: number }> {
    return pi.exec("git", args, { signal, timeout: 15000 });
}

async function gatherContext(
    pi: ExtensionAPI,
    signal?: AbortSignal,
): Promise<{
    status: string;
    diff: string;
    branch: string;
    log: string;
} | null> {
    const [statusResult, diffResult, branchResult, logResult] =
        await Promise.all([
            runGit(pi, ["status"], signal),
            runGit(pi, ["diff", "--cached"], signal),
            runGit(pi, ["branch", "--show-current"], signal),
            runGit(pi, ["log", "--oneline", "-10"], signal),
        ]);

    if (statusResult.code !== 0) return null;

    return {
        status: statusResult.stdout,
        diff: diffResult.stdout,
        branch: branchResult.stdout.trim(),
        log: logResult.stdout,
    };
}

function buildUserMessage(
    context: { status: string; diff: string; branch: string; log: string },
    additionalInstructions: string,
): string {
    let text = `## git status\n\`\`\`\n${context.status}\n\`\`\`\n\n`;
    text += `## git diff --cached\n\`\`\`\n${context.diff}\n\`\`\`\n\n`;
    text += `## Current branch\n${context.branch}\n\n`;
    text += `## Recent log\n\`\`\`\n${context.log}\n\`\`\``;

    if (additionalInstructions.trim()) {
        text += `\n\n## Additional instructions\n${additionalInstructions.trim()}`;
    }

    return text;
}

// --- Core handler ---

async function handleCommitStaged(
    pi: ExtensionAPI,
    ctx: ExtensionContext,
    additionalInstructions: string,
): Promise<void> {
    if (!ctx.hasUI) {
        ctx.ui.notify("quick-commit requires interactive mode", "error");
        return;
    }

    if (!ctx.model) {
        ctx.ui.notify("No model selected", "error");
        return;
    }

    // 1. Gather git context
    const context = await gatherContext(pi);
    if (!context) {
        ctx.ui.notify(
            "Failed to run git commands. Are you in a git repo?",
            "error",
        );
        return;
    }

    if (!context.diff.trim()) {
        ctx.ui.notify("No staged changes to commit", "info");
        return;
    }

    // 2. Select model
    const model = await selectModel(ctx.model, ctx.modelRegistry);

    // 3. Generate commit message with loader UI
    const commitMessage = await ctx.ui.custom<string | null>(
        (tui, theme, _kb, done) => {
            const loader = new BorderedLoader(
                tui,
                theme,
                `Generating commit message using ${model.id}...`,
            );
            loader.onAbort = () => done(null);

            const doGenerate = async () => {
                const apiKey = await ctx.modelRegistry.getApiKey(model);
                const userMessage: UserMessage = {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: buildUserMessage(
                                context,
                                additionalInstructions,
                            ),
                        },
                    ],
                    timestamp: Date.now(),
                };

                const response = await complete(
                    model,
                    {
                        systemPrompt: SYSTEM_PROMPT,
                        messages: [userMessage],
                    },
                    { apiKey, signal: loader.signal },
                );

                if (response.stopReason === "aborted") return null;

                const text = response.content
                    .filter(
                        (c): c is { type: "text"; text: string } =>
                            c.type === "text",
                    )
                    .map((c) => c.text)
                    .join("\n")
                    .trim();

                return text || null;
            };

            doGenerate()
                .then(done)
                .catch((err) => {
                    ctx.ui.notify(
                        `Generation failed: ${err instanceof Error ? err.message : String(err)}`,
                        "error",
                    );
                    done(null);
                });

            return loader;
        },
    );

    if (!commitMessage) {
        ctx.ui.notify("Cancelled", "info");
        return;
    }

    // 4. Let user review/edit the commit message
    const edited = await ctx.ui.editor("Edit commit message", commitMessage);
    if (edited === undefined || !edited.trim()) {
        ctx.ui.notify("Cancelled", "info");
        return;
    }

    // 5. Commit
    const commitResult = await runGit(pi, ["commit", "-m", edited.trim()]);
    if (commitResult.code !== 0) {
        ctx.ui.notify(`git commit failed: ${commitResult.stderr}`, "error");
        return;
    }

    // git commit output first line is typically: [branch hash] subject
    const firstLine = commitResult.stdout.split("\n")[0] || "";
    const match = firstLine.match(/^\[(\S+)\s+([a-f0-9]+)\]\s+(.*)$/);
    const summary = match
        ? `✓ ${match[1]} ${match[2]} — ${match[3]}`
        : firstLine || "Committed!";
    ctx.ui.notify(summary, "info");
}

// --- Extension entry point ---

export default function (pi: ExtensionAPI) {
    pi.registerCommand("quick-commit", {
        description:
            "Quick commit: commit staged changes with a generated message",
        handler: async (args, ctx) => {
            await handleCommitStaged(pi, ctx, args);
        },
    });
}
