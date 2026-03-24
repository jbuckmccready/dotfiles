import {
    createLsTool,
    type AgentToolResult,
    type AgentToolUpdateCallback,
    type ExtensionContext,
    type LsToolDetails,
    type LsToolInput,
    type Theme,
    type ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { Text, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import {
    component,
    shortenPath,
    getSanitizedTextOutput,
    replaceTabs,
    countRenderedLinesWithoutNotice,
} from "./shared";
import type { SandboxAPI } from "./sandbox-shared";
import { getToolViewMode, type ToolViewMode } from "./tool-view-mode";

type CompCache = Partial<Record<ToolViewMode, Component>>;

type LsRenderState = {
    lineCount?: number;
    truncated?: boolean;
};

type LsRenderContext = {
    state: LsRenderState;
    invalidate: () => void;
};

function hasLsNotice(details: LsToolDetails | undefined): boolean {
    return (
        details?.entryLimitReached !== undefined ||
        details?.truncation?.truncated === true
    );
}

export function createLsOverride(sandbox: SandboxAPI) {
    const lsCache = new WeakMap<object, CompCache>();

    return {
        execute(
            toolCallId: string,
            params: LsToolInput,
            signal: AbortSignal | undefined,
            onUpdate:
                | AgentToolUpdateCallback<LsToolDetails | undefined>
                | undefined,
            ctx: ExtensionContext,
        ): Promise<AgentToolResult<LsToolDetails | undefined>> {
            return createLsTool(sandbox.translatePath(ctx.cwd), {
                operations: sandbox.getOps().ls,
            }).execute(toolCallId, params, signal, onUpdate);
        },

        renderCall(
            args: LsToolInput,
            theme: Theme,
            context: LsRenderContext,
        ) {
            const rawPath = args.path || ".";
            const path = shortenPath(rawPath);
            const limit = args.limit;

            let title =
                theme.fg("toolTitle", theme.bold("ls")) +
                " " +
                theme.fg("accent", path);
            if (limit !== undefined) {
                title += theme.fg("toolOutput", ` (limit ${limit})`);
            }
            if (context.state.lineCount !== undefined) {
                let suffix = ` • ${context.state.lineCount} lines`;
                if (context.state.truncated) {
                    suffix += " [Truncated]";
                }
                title += theme.fg("warning", suffix);
            }

            return component((width) => wrapTextWithAnsi(title, width));
        },

        renderResult(
            result: AgentToolResult<LsToolDetails | undefined>,
            { isPartial }: ToolRenderResultOptions,
            theme: Theme,
            context: LsRenderContext,
        ) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Listing..."), 0, 0);
            }

            const details = result.details;
            const lineCount = countRenderedLinesWithoutNotice(
                getSanitizedTextOutput(result),
                hasLsNotice(details),
            );
            const truncated = hasLsNotice(details);
            if (
                context.state.lineCount !== lineCount ||
                context.state.truncated !== truncated
            ) {
                context.state.lineCount = lineCount;
                context.state.truncated = truncated;
                context.invalidate();
            }
            const mode = getToolViewMode();
            if (details) {
                const cached = lsCache.get(details)?.[mode];
                if (cached) return cached;
            }

            const output = getSanitizedTextOutput(result).trim();
            const outputLines = output
                ? output
                      .split("\n")
                      .map((line) =>
                          theme.fg("toolOutput", replaceTabs(line)),
                      )
                : [];

            const comp = component(() => {
                if (mode === "minimal") return [];
                const lines: string[] = [];
                if (outputLines.length > 0) {
                    const maxLines =
                        mode === "expanded" ? outputLines.length : 20;
                    const display = outputLines.slice(0, maxLines);
                    const remaining = outputLines.length - maxLines;
                    lines.push(...display);
                    if (remaining > 0) {
                        lines.push(
                            theme.fg("muted", `... (${remaining} more lines)`),
                        );
                    }
                }
                return lines;
            });
            if (details) {
                const pair = lsCache.get(details) || {};
                pair[mode] = comp;
                lsCache.set(details, pair);
            }
            return comp;
        },
    };
}
