import {
    createBashTool,
    truncateToVisualLines,
    keyHint,
} from "@mariozechner/pi-coding-agent";
import { wrapTextWithAnsi } from "@mariozechner/pi-tui";
import {
    makeSep,
    component,
    getSanitizedTextOutput,
    replaceTabs,
} from "./shared";
import type { SandboxAPI } from "./sandbox-shared";

const BASH_PREVIEW_LINES = 5;

type ExpandState = "expanded" | "collapsed";
type CompCache = Partial<Record<ExpandState, any>>;

export function createBashOverride(sandbox: SandboxAPI) {
    const bashCache = new WeakMap<object, CompCache>();

    return {
        async execute(
            id: any,
            params: any,
            signal: any,
            onUpdate: any,
            _ctx: any,
        ) {
            const localCwd = process.cwd();
            return createBashTool(localCwd, {
                operations: sandbox.getOps().bash,
            }).execute(id, params, signal, onUpdate);
        },

        renderCall(args: any, theme: any) {
            const command = args?.command as string | undefined;
            const timeout = args?.timeout as number | undefined;
            const timeoutSuffix = timeout
                ? theme.fg("muted", ` (timeout ${timeout}s)`)
                : "";
            const commandDisplay = command
                ? command
                : theme.fg("toolOutput", "...");
            const title =
                theme.fg("toolTitle", theme.bold(`$ ${commandDisplay}`)) +
                timeoutSuffix;
            return component((width) => wrapTextWithAnsi(title, width));
        },

        renderResult(result: any, { expanded, isPartial }: any, theme: any) {
            const details = result.details;
            const key: ExpandState = expanded ? "expanded" : "collapsed";
            if (!isPartial && details) {
                const cached = bashCache.get(details)?.[key];
                if (cached) return cached;
            }

            const output = getSanitizedTextOutput(result).trim();
            const borderAnsi = theme.getFgAnsi("borderMuted");

            const outputLines = output
                ? output
                      .split("\n")
                      .map((l: string) =>
                          theme.fg("toolOutput", replaceTabs(l)),
                      )
                : [];

            const warnings: string[] = [];
            if (details?.fullOutputPath) {
                warnings.push(`Full output: ${details.fullOutputPath}`);
            }
            if (details?.truncation?.truncated) {
                const t = details.truncation;
                if (t.truncatedBy === "lines") {
                    warnings.push(
                        `Truncated: showing ${t.outputLines} of ${t.totalLines} lines`,
                    );
                } else {
                    warnings.push(`Truncated: ${t.outputLines} lines shown`);
                }
            }
            const warningLine =
                warnings.length > 0
                    ? theme.fg("warning", `[${warnings.join(". ")}]`)
                    : null;

            const styledOutput =
                outputLines.length > 0 ? outputLines.join("\n") : "";

            const comp = component((width) => {
                const lines: string[] = [];
                if (styledOutput) {
                    if (expanded) {
                        lines.push(makeSep(borderAnsi, width), ...outputLines);
                    } else {
                        const result = truncateToVisualLines(
                            styledOutput,
                            BASH_PREVIEW_LINES,
                            width,
                        );
                        if (result.skippedCount > 0) {
                            const hint =
                                theme.fg(
                                    "muted",
                                    `... (${result.skippedCount} earlier lines,`,
                                ) + ` ${keyHint("expandTools", "to expand")})`;
                            lines.push(
                                makeSep(borderAnsi, width),
                                hint,
                                ...result.visualLines,
                            );
                        } else {
                            lines.push(
                                makeSep(borderAnsi, width),
                                ...result.visualLines,
                            );
                        }
                    }
                }
                if (warningLine) lines.push("", warningLine);
                lines.push(makeSep(borderAnsi, width));
                return lines;
            });
            if (!isPartial && details) {
                const pair = bashCache.get(details) || {};
                pair[key] = comp;
                bashCache.set(details, pair);
            }
            return comp;
        },
    };
}
