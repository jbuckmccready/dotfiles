/**
 * Add separator lines to read, grep, write, find, and ls tools.
 *
 * Overrides these built-in tools to add Catppuccin-style separator lines
 * (borderMuted colored ─── lines) above the tool title and below the result,
 * matching the style used in edit-diff-lines.ts.
 *
 * bash is handled separately in sandbox/index.ts (which already overrides it).
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
    createReadTool,
    createGrepTool,
    createWriteTool,
    createFindTool,
    createLsTool,
    highlightCode,
    getLanguageFromPath,
} from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { homedir } from "os";
import { getSanitizedTextOutput } from "../extensions_lib/tool-output";

function shortenPath(path: string): string {
    const home = homedir();
    return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function replaceTabs(text: string): string {
    return text.replace(/\t/g, "   ");
}

function makeSep(borderAnsi: string, width: number): string {
    return borderAnsi + "─".repeat(width) + "\x1b[39m";
}

function component(renderFn: (width: number) => string[]) {
    return {
        invalidate() {},
        render(width: number) {
            return renderFn(width).map((l) => truncateToWidth(l, width));
        },
    } as any;
}

export default function (pi: ExtensionAPI) {
    // ── read ─────────────────────────────────────────────────────────

    const builtinRead = createReadTool(process.cwd());

    // Shared between renderCall and renderResult within a single
    // synchronous updateDisplay() cycle.
    let lastReadPath: string | undefined;

    pi.registerTool({
        name: "read",
        label: builtinRead.label,
        description: builtinRead.description,
        parameters: builtinRead.parameters,

        execute(toolCallId, params, signal, onUpdate, ctx) {
            return createReadTool(ctx.cwd).execute(
                toolCallId,
                params,
                signal,
                onUpdate,
            );
        },

        renderCall(args, theme) {
            const rawPath = ((args as Record<string, unknown>)?.file_path ?? args?.path) as
                | string
                | undefined;
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

        renderResult(result, { expanded, isPartial }, theme) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Reading..."), 0, 0);
            }

            const output = getSanitizedTextOutput(result);
            const details = (result as any).details;
            const borderAnsi = theme.getFgAnsi("borderMuted");

            // Capture path from renderCall (called synchronously just before)
            const rawPath = lastReadPath;
            const lang = rawPath
                ? getLanguageFromPath(rawPath.replace(/^@/, ""))
                : undefined;

            // Pre-compute highlighted lines
            const highlighted = lang
                ? highlightCode(replaceTabs(output), lang)
                : output
                      .split("\n")
                      .map((l: string) =>
                          theme.fg("toolOutput", replaceTabs(l)),
                      );

            // Truncation warning
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

            return component((width) => {
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
        },
    });

    // ── grep ─────────────────────────────────────────────────────────

    const builtinGrep = createGrepTool(process.cwd());
    pi.registerTool({
        name: "grep",
        label: builtinGrep.label,
        description: builtinGrep.description,
        parameters: builtinGrep.parameters,

        execute(toolCallId, params, signal, onUpdate, ctx) {
            return createGrepTool(ctx.cwd).execute(
                toolCallId,
                params,
                signal,
                onUpdate,
            );
        },

        renderCall(args, theme) {
            const pattern = args?.pattern as string | undefined;
            const rawPath = (args?.path as string) || ".";
            const path = shortenPath(rawPath);
            const glob = args?.glob as string | undefined;
            const limit = args?.limit as number | undefined;

            let title =
                theme.fg("toolTitle", theme.bold("grep")) +
                " " +
                (pattern !== undefined
                    ? theme.fg("accent", `/${pattern || ""}/`)
                    : theme.fg("toolOutput", "...")) +
                theme.fg("toolOutput", ` in ${path}`);
            if (glob) {
                title += theme.fg("toolOutput", ` (${glob})`);
            }
            if (limit !== undefined) {
                title += theme.fg("toolOutput", ` limit ${limit}`);
            }

            return component((width) => wrapTextWithAnsi(title, width));
        },

        renderResult(result, { expanded, isPartial }, theme) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Searching..."), 0, 0);
            }

            const output = getSanitizedTextOutput(result).trim();
            const details = (result as any).details;
            const borderAnsi = theme.getFgAnsi("borderMuted");

            const outputLines = output
                ? output
                      .split("\n")
                      .map((l: string) => theme.fg("toolOutput", l))
                : [];

            // Build warnings
            const warnings: string[] = [];
            if (details?.matchLimitReached) {
                warnings.push(`${details.matchLimitReached} matches limit`);
            }
            if (details?.truncation?.truncated) {
                warnings.push("output truncated");
            }
            if (details?.linesTruncated) {
                warnings.push("some lines truncated");
            }
            const warningLine =
                warnings.length > 0
                    ? theme.fg("warning", `[Truncated: ${warnings.join(", ")}]`)
                    : null;

            return component((width) => {
                const lines: string[] = [];
                if (outputLines.length > 0) {
                    const maxLines = expanded ? outputLines.length : 15;
                    const display = outputLines.slice(0, maxLines);
                    const remaining = outputLines.length - maxLines;
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
        },
    });

    // ── write ────────────────────────────────────────────────────────

    const builtinWrite = createWriteTool(process.cwd());

    // Shared between renderCall and renderResult within a single
    // synchronous updateDisplay() cycle.
    let lastWritePath: string | undefined;
    let lastWriteContent: string | undefined;

    // Incremental highlight cache for write tool streaming
    let writeHlCache: {
        rawPath: string;
        lang: string;
        rawContent: string;
        highlightedLines: string[];
    } | undefined;

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
            const delta = content.slice(writeHlCache.rawContent.length);
            const deltaNorm = replaceTabs(delta);
            const segments = deltaNorm.split("\n");
            const cache = writeHlCache;
            cache.rawContent = content;

            // Append delta to last line + new lines
            if (cache.highlightedLines.length === 0) {
                cache.highlightedLines.push("");
            }
            const lastIdx = cache.highlightedLines.length - 1;
            // Re-highlight the last line (it got extended)
            const allNorm = replaceTabs(content);
            const allLines = allNorm.split("\n");
            const singleHl = (line: string) => highlightCode(line, lang)[0] ?? line;

            cache.highlightedLines[lastIdx] = singleHl(allLines[lastIdx]);
            for (let s = 1; s < segments.length; s++) {
                cache.highlightedLines.push(singleHl(allLines[lastIdx + s]));
            }

            return cache.highlightedLines;
        }

        // Cache miss: full re-highlight
        const normalized = replaceTabs(content);
        const highlighted = highlightCode(normalized, lang);
        writeHlCache = { rawPath: rawPath!, lang, rawContent: content, highlightedLines: highlighted };
        return highlighted;
    }

    pi.registerTool({
        name: "write",
        label: builtinWrite.label,
        description: builtinWrite.description,
        parameters: builtinWrite.parameters,

        execute(toolCallId, params, signal, onUpdate, ctx) {
            return createWriteTool(ctx.cwd).execute(
                toolCallId,
                params,
                signal,
                onUpdate,
            );
        },

        renderCall(args, theme) {
            const rawPath = ((args as Record<string, unknown>)?.file_path ?? args?.path) as
                | string
                | undefined;
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
            const borderAnsi = theme.getFgAnsi("borderMuted");

            const contentLines = getWriteHighlighted(rawPath, fileContent, theme);

            return component((width) => {
                const lines = [...wrapTextWithAnsi(title, width)];
                if (contentLines.length > 0) {
                    const maxLines = 10;
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
                return lines;
            });
        },

        renderResult(result, { expanded, isPartial }, theme) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Writing..."), 0, 0);
            }

            // renderResult() does not include an isError flag.
            // For write, success has details === undefined, while agent-loop
            // populates details = {} when execution throws.
            const isError = (result as any).details !== undefined;
            const output = getSanitizedTextOutput(result).trim();
            const borderAnsi = theme.getFgAnsi("borderMuted");

            // Capture from renderCall closure
            const rawPath = lastWritePath;
            const fileContent = lastWriteContent || "";

            if (isError && output) {
                return component((width) => [
                    "",
                    theme.fg("error", output),
                    makeSep(borderAnsi, width),
                ]);
            }

            // Final full re-highlight for expand support
            const contentLines = fileContent
                ? getWriteHighlighted(rawPath, fileContent, theme)
                : [];

            return component((width) => {
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
        },
    });

    // ── find ─────────────────────────────────────────────────────────

    const builtinFind = createFindTool(process.cwd());
    pi.registerTool({
        name: "find",
        label: builtinFind.label,
        description: builtinFind.description,
        parameters: builtinFind.parameters,

        execute(toolCallId, params, signal, onUpdate, ctx) {
            return createFindTool(ctx.cwd).execute(
                toolCallId,
                params,
                signal,
                onUpdate,
            );
        },

        renderCall(args, theme) {
            const pattern = args?.pattern as string | undefined;
            const rawPath = (args?.path as string) || ".";
            const path = shortenPath(rawPath);
            const limit = args?.limit as number | undefined;

            let title =
                theme.fg("toolTitle", theme.bold("find")) +
                " " +
                (pattern !== undefined
                    ? theme.fg("accent", pattern || "")
                    : theme.fg("toolOutput", "...")) +
                theme.fg("toolOutput", ` in ${path}`);
            if (limit !== undefined) {
                title += theme.fg("toolOutput", ` (limit ${limit})`);
            }

            return component((width) => wrapTextWithAnsi(title, width));
        },

        renderResult(result, { expanded, isPartial }, theme) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Searching..."), 0, 0);
            }

            const output = getSanitizedTextOutput(result).trim();
            const details = (result as any).details;
            const borderAnsi = theme.getFgAnsi("borderMuted");

            const outputLines = output
                ? output
                      .split("\n")
                      .map((l: string) => theme.fg("toolOutput", l))
                : [];

            // Build warnings
            const warnings: string[] = [];
            if (details?.resultLimitReached) {
                warnings.push(`${details.resultLimitReached} results limit`);
            }
            if (details?.truncation?.truncated) {
                warnings.push("output truncated");
            }
            const warningLine =
                warnings.length > 0
                    ? theme.fg("warning", `[Truncated: ${warnings.join(", ")}]`)
                    : null;

            return component((width) => {
                const lines: string[] = [];
                if (outputLines.length > 0) {
                    const maxLines = expanded ? outputLines.length : 20;
                    const display = outputLines.slice(0, maxLines);
                    const remaining = outputLines.length - maxLines;
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
        },
    });

    // ── ls ────────────────────────────────────────────────────────────

    const builtinLs = createLsTool(process.cwd());
    pi.registerTool({
        name: "ls",
        label: builtinLs.label,
        description: builtinLs.description,
        parameters: builtinLs.parameters,

        execute(toolCallId, params, signal, onUpdate, ctx) {
            return createLsTool(ctx.cwd).execute(
                toolCallId,
                params,
                signal,
                onUpdate,
            );
        },

        renderCall(args, theme) {
            const rawPath = (args?.path as string) || ".";
            const path = shortenPath(rawPath);
            const limit = args?.limit as number | undefined;

            let title =
                theme.fg("toolTitle", theme.bold("ls")) +
                " " +
                theme.fg("accent", path);
            if (limit !== undefined) {
                title += theme.fg("toolOutput", ` (limit ${limit})`);
            }

            return component((width) => wrapTextWithAnsi(title, width));
        },

        renderResult(result, { expanded, isPartial }, theme) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Listing..."), 0, 0);
            }

            const output = getSanitizedTextOutput(result).trim();
            const details = (result as any).details;
            const borderAnsi = theme.getFgAnsi("borderMuted");

            const outputLines = output
                ? output
                      .split("\n")
                      .map((l: string) => theme.fg("toolOutput", l))
                : [];

            // Build warnings
            const warnings: string[] = [];
            if (details?.entryLimitReached) {
                warnings.push(`${details.entryLimitReached} entries limit`);
            }
            if (details?.truncation?.truncated) {
                warnings.push("output truncated");
            }
            const warningLine =
                warnings.length > 0
                    ? theme.fg("warning", `[Truncated: ${warnings.join(", ")}]`)
                    : null;

            return component((width) => {
                const lines: string[] = [];
                if (outputLines.length > 0) {
                    const maxLines = expanded ? outputLines.length : 20;
                    const display = outputLines.slice(0, maxLines);
                    const remaining = outputLines.length - maxLines;
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
        },
    });
}
