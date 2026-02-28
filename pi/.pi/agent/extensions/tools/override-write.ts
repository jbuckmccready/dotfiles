import {
    createWriteTool,
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

export function createWriteOverride() {
    let lastWritePath: string | undefined;
    let lastWriteContent: string | undefined;
    const writeCache = new WeakMap<object, CompCache>();

    let writeHlCache:
        | {
              rawPath: string;
              lang: string;
              rawContent: string;
              highlightedLines: string[];
          }
        | undefined;

    function getWriteHighlighted(
        rawPath: string | undefined,
        content: string,
        theme: any,
    ): string[] {
        if (!content) return [];

        const lang = rawPath
            ? getLanguageFromPath(rawPath.replace(/^@/, ""))
            : undefined;

        if (!lang) {
            return content
                .split("\n")
                .map((l: string) => theme.fg("toolOutput", replaceTabs(l)));
        }

        // Cache hit: content is appended (streaming)
        if (
            writeHlCache &&
            writeHlCache.lang === lang &&
            writeHlCache.rawPath === rawPath &&
            content.startsWith(writeHlCache.rawContent) &&
            content.length > writeHlCache.rawContent.length
        ) {
            const cache = writeHlCache;
            cache.rawContent = content;
            const normalized = replaceTabs(content);
            cache.highlightedLines = highlightCode(normalized, lang);
            return cache.highlightedLines;
        }

        // Cache miss: full re-highlight
        const normalized = replaceTabs(content);
        const highlighted = highlightCode(normalized, lang);
        writeHlCache = {
            rawPath: rawPath!,
            lang,
            rawContent: content,
            highlightedLines: highlighted,
        };
        return highlighted;
    }

    return {
        execute(toolCallId: any, params: any, signal: any, onUpdate: any, ctx: any) {
            return createWriteTool(ctx.cwd).execute(
                toolCallId,
                params,
                signal,
                onUpdate,
            );
        },

        renderCall(args: any, theme: any) {
            const rawPath = ((args as Record<string, unknown>)?.file_path ??
                args?.path) as string | undefined;
            lastWritePath = rawPath;
            const fileContent = (args?.content as string) || "";
            lastWriteContent = fileContent;
            const path = rawPath
                ? shortenPath(rawPath.replace(/^@/, ""))
                : "...";

            const pathDisplay = rawPath
                ? theme.fg("accent", path)
                : theme.fg("toolOutput", "...");

            const title = `${theme.fg("toolTitle", theme.bold("write"))} ${pathDisplay}`;

            return component((width) => wrapTextWithAnsi(title, width));
        },

        renderResult(result: any, { expanded, isPartial }: any, theme: any) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Writing..."), 0, 0);
            }

            const details = (result as any).details;
            const isError = details !== undefined;

            const output = getSanitizedTextOutput(result).trim();
            const borderAnsi = theme.getFgAnsi("borderMuted");

            const rawPath = lastWritePath;
            const fileContent = lastWriteContent || "";

            if (isError && output) {
                return component((width) => [
                    "",
                    theme.fg("error", output),
                    makeSep(borderAnsi, width),
                ]);
            }

            const key: ExpandState = expanded ? "expanded" : "collapsed";
            if (details) {
                const cached = writeCache.get(details)?.[key];
                if (cached) return cached;
            }

            const contentLines = fileContent
                ? getWriteHighlighted(rawPath, fileContent, theme)
                : [];

            const comp = component((width) => {
                const lines: string[] = [];
                if (contentLines.length > 0) {
                    const maxLines = expanded ? contentLines.length : 10;
                    const display = contentLines.slice(0, maxLines);
                    const remaining = contentLines.length - maxLines;
                    lines.push(makeSep(borderAnsi, width), ...display);
                    if (remaining > 0) {
                        lines.push(
                            theme.fg(
                                "muted",
                                `... (${remaining} more lines, ${contentLines.length} total)`,
                            ),
                        );
                    }
                }
                lines.push(makeSep(borderAnsi, width));
                return lines;
            });
            if (details) {
                const pair = writeCache.get(details) || {};
                pair[key] = comp;
                writeCache.set(details, pair);
            }
            return comp;
        },
    };
}
