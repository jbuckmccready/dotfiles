import { createLsTool } from "@mariozechner/pi-coding-agent";
import { Text, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import {
    makeSep,
    component,
    shortenPath,
    getSanitizedTextOutput,
} from "./shared";
import type { SandboxAPI } from "./sandbox-shared";

type ExpandState = "expanded" | "collapsed";
type CompCache = Partial<Record<ExpandState, any>>;

export function createLsOverride(sandbox: SandboxAPI) {
    const lsCache = new WeakMap<object, CompCache>();

    return {
        execute(
            toolCallId: any,
            params: any,
            signal: any,
            onUpdate: any,
            ctx: any,
        ) {
            return createLsTool(ctx.cwd, {
                operations: sandbox.getOps().ls,
            }).execute(toolCallId, params, signal, onUpdate);
        },

        renderCall(args: any, theme: any) {
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

        renderResult(result: any, { expanded, isPartial }: any, theme: any) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Listing..."), 0, 0);
            }

            const details = (result as any).details;
            const key: ExpandState = expanded ? "expanded" : "collapsed";
            if (details) {
                const cached = lsCache.get(details)?.[key];
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

            const comp = component((width) => {
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
            if (details) {
                const pair = lsCache.get(details) || {};
                pair[key] = comp;
                lsCache.set(details, pair);
            }
            return comp;
        },
    };
}
