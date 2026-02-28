import {
    type BashOperations,
    createBashTool,
} from "@mariozechner/pi-coding-agent";
import { Text, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { makeSep, component, getSanitizedTextOutput } from "./shared";

export interface SandboxAPI {
    isActive(): boolean;
    createBashOps(): BashOperations;
}

type ExpandState = "expanded" | "collapsed";
type CompCache = Partial<Record<ExpandState, any>>;

export function createBashOverride(sandboxAPI: SandboxAPI) {
    const bashCache = new WeakMap<object, CompCache>();

    return {
        async execute(id: any, params: any, signal: any, onUpdate: any, _ctx: any) {
            const localCwd = process.cwd();
            if (!sandboxAPI.isActive()) {
                return createBashTool(localCwd).execute(id, params, signal, onUpdate);
            }

            const sandboxedBash = createBashTool(localCwd, {
                operations: sandboxAPI.createBashOps(),
            });
            return sandboxedBash.execute(id, params, signal, onUpdate);
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
            if (isPartial) {
                return new Text(theme.fg("warning", "Running..."), 0, 0);
            }

            const details = result.details;
            const key: ExpandState = expanded ? "expanded" : "collapsed";
            if (details) {
                const cached = bashCache.get(details)?.[key];
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
                    warnings.push(
                        `Truncated: ${t.outputLines} lines shown`,
                    );
                }
            }
            const warningLine =
                warnings.length > 0
                    ? theme.fg("warning", `[${warnings.join(". ")}]`)
                    : null;

            const comp = component((width) => {
                const lines: string[] = [];
                if (outputLines.length > 0) {
                    const maxLines = expanded ? outputLines.length : 5;
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
                const pair = bashCache.get(details) || {};
                pair[key] = comp;
                bashCache.set(details, pair);
            }
            return comp;
        },
    };
}
