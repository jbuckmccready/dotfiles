import { createGrepTool } from "@mariozechner/pi-coding-agent";
import { Text, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import {
    makeSep,
    component,
    shortenPath,
    getSanitizedTextOutput,
} from "./shared";

type ExpandState = "expanded" | "collapsed";
type CompCache = Partial<Record<ExpandState, any>>;

export function createGrepOverride() {
    const grepCache = new WeakMap<object, CompCache>();

    return {
        execute(toolCallId: any, params: any, signal: any, onUpdate: any, ctx: any) {
            return createGrepTool(ctx.cwd).execute(
                toolCallId,
                params,
                signal,
                onUpdate,
            );
        },

        renderCall(args: any, theme: any) {
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

        renderResult(result: any, { expanded, isPartial }: any, theme: any) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Searching..."), 0, 0);
            }

            const details = (result as any).details;
            const key: ExpandState = expanded ? "expanded" : "collapsed";
            if (details) {
                const cached = grepCache.get(details)?.[key];
                if (cached) return cached;
            }

            const output = getSanitizedTextOutput(result).trim();
            const borderAnsi = theme.getFgAnsi("borderMuted");

            const outputLines = output
                ? output
                      .split("\n")
                      .map((l: string) => theme.fg("toolOutput", l))
                : [];

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

            const comp = component((width) => {
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
            if (details) {
                const pair = grepCache.get(details) || {};
                pair[key] = comp;
                grepCache.set(details, pair);
            }
            return comp;
        },
    };
}
