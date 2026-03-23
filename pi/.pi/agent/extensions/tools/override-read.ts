import {
    createReadTool,
    highlightCode,
    getLanguageFromPath,
    type AgentToolResult,
    type AgentToolUpdateCallback,
    type ExtensionContext,
    type ReadToolDetails,
    type ReadToolInput,
    type Theme,
    type ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { Text, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import {
    component,
    shortenPath,
    replaceTabs,
    getSanitizedTextOutput,
} from "./shared";
import type { SandboxAPI } from "./sandbox-shared";
import { getToolViewMode, type ToolViewMode } from "./tool-view-mode";

type ReadRenderArgs = ReadToolInput & { file_path?: string };
type ReadRenderContext = { args: ReadRenderArgs };
type CompCache = Partial<Record<ToolViewMode, Component>>;

export function createReadOverride(sandbox: SandboxAPI) {
    const readCache = new WeakMap<object, CompCache>();

    return {
        execute(
            toolCallId: string,
            params: ReadToolInput,
            signal: AbortSignal | undefined,
            onUpdate:
                | AgentToolUpdateCallback<ReadToolDetails | undefined>
                | undefined,
            ctx: ExtensionContext,
        ): Promise<AgentToolResult<ReadToolDetails | undefined>> {
            return createReadTool(sandbox.translatePath(ctx.cwd), {
                operations: sandbox.getOps().read,
            }).execute(toolCallId, params, signal, onUpdate);
        },

        renderCall(args: ReadRenderArgs, theme: Theme) {
            const rawPath = args.file_path ?? args.path;
            const path = rawPath
                ? shortenPath(rawPath.replace(/^@/, ""))
                : "...";
            const offset = args.offset;
            const limit = args.limit;

            let pathDisplay = rawPath
                ? theme.fg("accent", path)
                : theme.fg("toolOutput", "...");
            if (offset !== undefined || limit !== undefined) {
                const startLine = offset ?? 1;
                const endLine =
                    limit !== undefined ? startLine + limit - 1 : "";
                pathDisplay += theme.fg(
                    "warning",
                    `:${startLine}${endLine ? `-${endLine}` : ""}`,
                );
            }

            const title = `${theme.fg("toolTitle", theme.bold("read"))} ${pathDisplay}`;
            return component((width) => wrapTextWithAnsi(title, width));
        },

        renderResult(
            result: AgentToolResult<ReadToolDetails | undefined>,
            { isPartial }: ToolRenderResultOptions,
            theme: Theme,
            context: ReadRenderContext,
        ) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Reading..."), 0, 0);
            }

            const details = result.details;
            const mode = getToolViewMode();
            if (details) {
                const cached = readCache.get(details)?.[mode];
                if (cached) return cached;
            }

            const output = getSanitizedTextOutput(result);
            const rawPath = context.args.file_path ?? context.args.path;
            const lang = rawPath
                ? getLanguageFromPath(rawPath.replace(/^@/, ""))
                : undefined;

            const highlighted = lang
                ? highlightCode(replaceTabs(output), lang)
                : output
                      .split("\n")
                      .map((line) =>
                          theme.fg("toolOutput", replaceTabs(line)),
                      );

            let warningLine: string | null = null;
            if (details?.truncation?.truncated) {
                const truncation = details.truncation;
                if (truncation.firstLineExceedsLimit) {
                    warningLine = theme.fg(
                        "warning",
                        `[First line exceeds limit]`,
                    );
                } else if (truncation.truncatedBy === "lines") {
                    warningLine = theme.fg(
                        "warning",
                        `[Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines]`,
                    );
                } else {
                    warningLine = theme.fg(
                        "warning",
                        `[Truncated: ${truncation.outputLines} lines shown]`,
                    );
                }
            }

            const comp = component(() => {
                if (mode === "minimal") return [];
                const lines: string[] = [];
                if (highlighted.length > 0) {
                    const maxLines =
                        mode === "expanded" ? highlighted.length : 10;
                    const display = highlighted.slice(0, maxLines);
                    const remaining = highlighted.length - maxLines;
                    lines.push(...display);
                    if (remaining > 0) {
                        lines.push(
                            theme.fg("muted", `... (${remaining} more lines)`),
                        );
                    }
                }
                if (warningLine) lines.push("", warningLine);
                return lines;
            });
            if (details) {
                const pair = readCache.get(details) || {};
                pair[mode] = comp;
                readCache.set(details, pair);
            }
            return comp;
        },
    };
}
