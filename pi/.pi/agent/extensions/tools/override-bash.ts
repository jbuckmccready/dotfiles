import {
    createBashTool,
    truncateToVisualLines,
    keyHint,
} from "@mariozechner/pi-coding-agent";
import { wrapTextWithAnsi } from "@mariozechner/pi-tui";
import {
    component,
    getSanitizedTextOutput,
    replaceTabs,
} from "./shared";
import type { SandboxAPI } from "./sandbox-shared";
import { getToolViewMode, type ToolViewMode } from "./tool-view-mode";

const BASH_PREVIEW_LINES = 5;

type CompCache = Partial<Record<ToolViewMode, any>>;

function formatDuration(ms: number): string {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}m ${rs}s`;
}

export function createBashOverride(sandbox: SandboxAPI) {
    const bashCache = new WeakMap<object, CompCache>();
    // Frozen durations keyed by args object reference (stable per ToolExecutionComponent)
    const frozenDurations = new WeakMap<object, number>();
    // Tracks the currently executing bash (only one at a time)
    let timer: { start: number; end?: number } | null = null;

    return {
        async execute(
            id: any,
            params: any,
            signal: any,
            onUpdate: any,
            _ctx: any,
        ) {
            const localCwd = process.cwd();
            const startTime = Date.now();
            timer = { start: startTime };

            let latestPartial: any = { content: [] };
            const wrappedOnUpdate = (partial: any) => {
                if (partial) latestPartial = partial;
                onUpdate?.(partial);
            };
            const heartbeat = setInterval(() => {
                onUpdate?.(latestPartial);
            }, 1000);

            try {
                const result = await createBashTool(localCwd, {
                    operations: sandbox.getOps().bash,
                }).execute(id, params, signal, wrappedOnUpdate);
                return result;
            } finally {
                clearInterval(heartbeat);
                timer = { start: startTime, end: Date.now() };
            }
        },

        renderCall(args: any, theme: any) {
            const command = args?.command as string | undefined;
            const timeout = args?.timeout as number | undefined;

            let timerSuffix = "";
            const frozen = args ? frozenDurations.get(args) : undefined;
            if (frozen !== undefined) {
                if (frozen >= 1000)
                    timerSuffix = " " + theme.fg("muted", formatDuration(frozen));
            } else if (timer?.end != null && args) {
                const duration = timer.end - timer.start;
                frozenDurations.set(args, duration);
                timer = null;
                if (duration >= 1000)
                    timerSuffix = " " + theme.fg("muted", formatDuration(duration));
            } else if (timer) {
                const elapsed = Date.now() - timer.start;
                if (elapsed >= 1000)
                    timerSuffix =
                        " " +
                        theme.fg("muted", formatDuration(elapsed));
            }

            const timeoutSuffix = timeout
                ? theme.fg("muted", ` (timeout ${timeout}s)`)
                : "";
            const commandDisplay = command
                ? command
                : theme.fg("toolOutput", "...");
            const title =
                theme.fg("toolTitle", theme.bold(`$ ${commandDisplay}`)) +
                timeoutSuffix +
                timerSuffix;
            return component((width) => wrapTextWithAnsi(title, width));
        },

        renderResult(result: any, { isPartial }: any, theme: any) {
            const details = result.details;
            const mode = getToolViewMode();
            if (!isPartial && details) {
                const cached = bashCache.get(details)?.[mode];
                if (cached) return cached;
            }

            const output = getSanitizedTextOutput(result).trim();
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
                if (mode === "minimal") return [];
                const lines: string[] = [];
                if (styledOutput) {
                    if (mode === "expanded") {
                        lines.push(...outputLines);
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
                                hint,
                                ...result.visualLines,
                            );
                        } else {
                            lines.push(
                                ...result.visualLines,
                            );
                        }
                    }
                }
                if (warningLine) lines.push("", warningLine);
                return lines;
            });
            if (!isPartial && details) {
                const pair = bashCache.get(details) || {};
                pair[mode] = comp;
                bashCache.set(details, pair);
            }
            return comp;
        },
    };
}
