import {
    createFindTool,
    type AgentToolResult,
    type AgentToolUpdateCallback,
    type ExtensionContext,
    type FindToolDetails,
    type FindToolInput,
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
import type { FindExecuteResult, SandboxAPI } from "./sandbox-shared";
import { getToolViewMode, type ToolViewMode } from "./tool-view-mode";

type CompCache = Partial<Record<ToolViewMode, Component>>;

type FindRenderState = {
    lineCount?: number;
    truncated?: boolean;
};

type FindRenderContext = {
    state: FindRenderState;
    invalidate: () => void;
};

function hasFindNotice(details: FindToolDetails | undefined): boolean {
    return (
        details?.resultLimitReached !== undefined ||
        details?.truncation?.truncated === true
    );
}

export function createFindOverride(sandbox: SandboxAPI) {
    const findCache = new WeakMap<object, CompCache>();

    return {
        execute(
            toolCallId: string,
            params: FindToolInput,
            signal: AbortSignal | undefined,
            onUpdate:
                | AgentToolUpdateCallback<FindToolDetails | undefined>
                | undefined,
            ctx: ExtensionContext,
        ): Promise<AgentToolResult<FindToolDetails | undefined>> {
            const ops = sandbox.getOps();
            if (ops.findExecute) {
                return ops.findExecute(
                    params,
                    signal,
                ) as Promise<
                    FindExecuteResult &
                        AgentToolResult<FindToolDetails | undefined>
                >;
            }
            return createFindTool(sandbox.translatePath(ctx.cwd), {
                operations: ops.find,
            }).execute(toolCallId, params, signal, onUpdate);
        },

        renderCall(
            args: FindToolInput,
            theme: Theme,
            context: FindRenderContext,
        ) {
            const pattern = args.pattern;
            const rawPath = args.path || ".";
            const path = shortenPath(rawPath);
            const limit = args.limit;

            let title =
                theme.fg("toolTitle", theme.bold("find")) +
                " " +
                theme.fg("accent", pattern || "") +
                theme.fg("toolOutput", ` in ${path}`);
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
            result: AgentToolResult<FindToolDetails | undefined>,
            { isPartial }: ToolRenderResultOptions,
            theme: Theme,
            context: FindRenderContext,
        ) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Searching..."), 0, 0);
            }

            const details = result.details;
            const lineCount = countRenderedLinesWithoutNotice(
                getSanitizedTextOutput(result),
                hasFindNotice(details),
            );
            const truncated = hasFindNotice(details);
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
                const cached = findCache.get(details)?.[mode];
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
                const pair = findCache.get(details) || {};
                pair[mode] = comp;
                findCache.set(details, pair);
            }
            return comp;
        },
    };
}
