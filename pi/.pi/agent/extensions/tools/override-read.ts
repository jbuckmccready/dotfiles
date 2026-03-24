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
type ReadRenderState = {
    lineCount?: number;
    truncated?: boolean;
};
type ReadRenderContext = {
    args: ReadRenderArgs;
    state: ReadRenderState;
    invalidate: () => void;
};
type CompCache = Partial<Record<ToolViewMode, Component>>;

function isImageReadResult(
    result: AgentToolResult<ReadToolDetails | undefined>,
): boolean {
    if (result.content.some((block) => block.type === "image")) {
        return true;
    }

    const firstTextBlock = result.content.find(
        (block) => block.type === "text",
    );
    return firstTextBlock?.type === "text"
        ? firstTextBlock.text?.startsWith("Read image file [") === true
        : false;
}

function countContentLines(text: string): number {
    return text === "" ? 0 : text.split("\n").length;
}

function getReadLineCount(
    result: AgentToolResult<ReadToolDetails | undefined>,
    args: ReadRenderArgs,
): number | undefined {
    if (isImageReadResult(result)) {
        return undefined;
    }

    const truncation = result.details?.truncation;
    if (truncation) {
        if (truncation.firstLineExceedsLimit) {
            return 0;
        }
        return truncation.outputLines;
    }

    const limit = args.limit;
    if (limit !== undefined && limit <= 0) {
        return 0;
    }

    const lineCount = countContentLines(getSanitizedTextOutput(result));
    if (
        typeof limit === "number" &&
        Number.isInteger(limit) &&
        limit > 0 &&
        lineCount > limit
    ) {
        return Math.max(0, lineCount - 2);
    }

    return lineCount;
}

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

        renderCall(
            args: ReadRenderArgs,
            theme: Theme,
            context: ReadRenderContext,
        ) {
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
            if (context.state.lineCount !== undefined) {
                let suffix = ` • ${context.state.lineCount} lines`;
                if (context.state.truncated) {
                    suffix += " [Truncated]";
                }
                pathDisplay += theme.fg("warning", suffix);
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

            const lineCount = getReadLineCount(result, context.args);
            const truncated = result.details?.truncation?.truncated === true;
            if (
                context.state.lineCount !== lineCount ||
                context.state.truncated !== truncated
            ) {
                context.state.lineCount = lineCount;
                context.state.truncated = truncated;
                context.invalidate();
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
                      .map((line) => theme.fg("toolOutput", replaceTabs(line)));

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
