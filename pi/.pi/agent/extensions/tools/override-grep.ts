import {
    createGrepTool,
    type AgentToolResult,
    type AgentToolUpdateCallback,
    type ExtensionContext,
    type GrepToolDetails,
    type GrepToolInput,
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
import type { GrepExecuteResult, SandboxAPI } from "./sandbox-shared";
import { getToolViewMode, type ToolViewMode } from "./tool-view-mode";

type CompCache = Partial<Record<ToolViewMode, Component>>;

type GrepRenderState = {
    lineCount?: number;
    truncated?: boolean;
};

type GrepRenderContext = {
    state: GrepRenderState;
    invalidate: () => void;
};

function hasGrepNotice(details: GrepToolDetails | undefined): boolean {
    return (
        details?.matchLimitReached !== undefined ||
        details?.truncation?.truncated === true ||
        details?.linesTruncated === true
    );
}

export function createGrepOverride(sandbox: SandboxAPI) {
    const grepCache = new WeakMap<object, CompCache>();

    return {
        execute(
            toolCallId: string,
            params: GrepToolInput,
            signal: AbortSignal | undefined,
            onUpdate:
                | AgentToolUpdateCallback<GrepToolDetails | undefined>
                | undefined,
            ctx: ExtensionContext,
        ): Promise<AgentToolResult<GrepToolDetails | undefined>> {
            const ops = sandbox.getOps();
            if (ops.grepExecute) {
                return ops.grepExecute(
                    params,
                    signal,
                ) as Promise<GrepExecuteResult & AgentToolResult<GrepToolDetails | undefined>>;
            }
            return createGrepTool(sandbox.translatePath(ctx.cwd), {
                operations: ops.grep,
            }).execute(toolCallId, params, signal, onUpdate);
        },

        renderCall(
            args: GrepToolInput,
            theme: Theme,
            context: GrepRenderContext,
        ) {
            const pattern = args.pattern;
            const rawPath = args.path || ".";
            const path = shortenPath(rawPath);
            const glob = args.glob;
            const limit = args.limit;

            let title =
                theme.fg("toolTitle", theme.bold("grep")) +
                " " +
                theme.fg("accent", `/${pattern || ""}/`) +
                theme.fg("toolOutput", ` in ${path}`);
            if (glob) {
                title += theme.fg("toolOutput", ` (${glob})`);
            }
            if (limit !== undefined) {
                title += theme.fg("toolOutput", ` limit ${limit}`);
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
            result: AgentToolResult<GrepToolDetails | undefined>,
            { isPartial }: ToolRenderResultOptions,
            theme: Theme,
            context: GrepRenderContext,
        ) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Searching..."), 0, 0);
            }

            const details = result.details;
            const lineCount = countRenderedLinesWithoutNotice(
                getSanitizedTextOutput(result),
                hasGrepNotice(details),
            );
            const truncated = hasGrepNotice(details);
            if (
                context.state.lineCount !== lineCount ||
                context.state.truncated !== truncated
            ) {
                context.state.lineCount = lineCount;
                context.state.truncated = truncated;
                context.invalidate();
                // invalidate() synchronously re-renders, which already adds
                // the result component. Return empty to avoid duplication.
                return component(() => []);
            }
            const mode = getToolViewMode();
            if (details) {
                const cached = grepCache.get(details)?.[mode];
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
                        mode === "expanded" ? outputLines.length : 15;
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
                const pair = grepCache.get(details) || {};
                pair[mode] = comp;
                grepCache.set(details, pair);
            }
            return comp;
        },
    };
}
