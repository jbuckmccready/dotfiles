import {
    createReadTool,
    highlightCode,
    getLanguageFromPath,
} from "@mariozechner/pi-coding-agent";
import { Text, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import {
    makeSep,
    component,
    shortenPath,
    replaceTabs,
    getSanitizedTextOutput,
} from "./shared";

type ExpandState = "expanded" | "collapsed";
type CompCache = Partial<Record<ExpandState, any>>;

export function createReadOverride() {
    let lastReadPath: string | undefined;
    const readCache = new WeakMap<object, CompCache>();

    return {
        execute(toolCallId: any, params: any, signal: any, onUpdate: any, ctx: any) {
            return createReadTool(ctx.cwd).execute(
                toolCallId,
                params,
                signal,
                onUpdate,
            );
        },

        renderCall(args: any, theme: any) {
            const rawPath = ((args as Record<string, unknown>)?.file_path ??
                args?.path) as string | undefined;
            lastReadPath = rawPath;
            const path = rawPath
                ? shortenPath(rawPath.replace(/^@/, ""))
                : "...";
            const offset = args?.offset as number | undefined;
            const limit = args?.limit as number | undefined;

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

        renderResult(result: any, { expanded, isPartial }: any, theme: any) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Reading..."), 0, 0);
            }

            const details = (result as any).details;
            const key: ExpandState = expanded ? "expanded" : "collapsed";
            if (details) {
                const cached = readCache.get(details)?.[key];
                if (cached) return cached;
            }

            const output = getSanitizedTextOutput(result);
            const borderAnsi = theme.getFgAnsi("borderMuted");

            const rawPath = lastReadPath;
            const lang = rawPath
                ? getLanguageFromPath(rawPath.replace(/^@/, ""))
                : undefined;

            const highlighted = lang
                ? highlightCode(replaceTabs(output), lang)
                : output
                      .split("\n")
                      .map((l: string) =>
                          theme.fg("toolOutput", replaceTabs(l)),
                      );

            let warningLine: string | null = null;
            if (details?.truncation?.truncated) {
                const t = details.truncation;
                if (t.firstLineExceedsLimit) {
                    warningLine = theme.fg(
                        "warning",
                        `[First line exceeds limit]`,
                    );
                } else if (t.truncatedBy === "lines") {
                    warningLine = theme.fg(
                        "warning",
                        `[Truncated: showing ${t.outputLines} of ${t.totalLines} lines]`,
                    );
                } else {
                    warningLine = theme.fg(
                        "warning",
                        `[Truncated: ${t.outputLines} lines shown]`,
                    );
                }
            }

            const comp = component((width) => {
                const lines: string[] = [];
                if (highlighted.length > 0) {
                    const maxLines = expanded ? highlighted.length : 10;
                    const display = highlighted.slice(0, maxLines);
                    const remaining = highlighted.length - maxLines;
                    lines.push(makeSep(borderAnsi, width), ...display);
                    if (remaining > 0) {
                        lines.push(
                            theme.fg("muted", `... (${remaining} more lines)`),
                        );
                    }
                }
                if (warningLine) lines.push("", warningLine);
                lines.push(makeSep(borderAnsi, width));
                return lines;
            });
            if (details) {
                const pair = readCache.get(details) || {};
                pair[key] = comp;
                readCache.set(details, pair);
            }
            return comp;
        },
    };
}
