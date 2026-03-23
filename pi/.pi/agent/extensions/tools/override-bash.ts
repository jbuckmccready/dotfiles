import {
    createBashToolDefinition,
    truncateToVisualLines,
    keyHint,
    type AgentToolResult,
    type AgentToolUpdateCallback,
    type BashToolDetails,
    type BashToolInput,
    type ExtensionContext,
    type Theme,
    type ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { component, getSanitizedTextOutput, replaceTabs } from "./shared";
import type { SandboxAPI } from "./sandbox-shared";
import { getToolViewMode, type ToolViewMode } from "./tool-view-mode";

const BASH_PREVIEW_LINES = 5;

type CompCache = Partial<Record<ToolViewMode, Component>>;

type BashRenderState = {
    startedAt?: number;
    endedAt?: number;
    interval?: NodeJS.Timeout;
};

type BashRenderContext = {
    state: BashRenderState;
    executionStarted: boolean;
    invalidate: () => void;
    isError: boolean;
};

function formatDuration(ms: number): string {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return `${m}m ${rs}s`;
}

export function createBashOverride(sandbox: SandboxAPI) {
    const bashCache = new WeakMap<object, CompCache>();

    return {
        async execute(
            id: string,
            params: BashToolInput,
            signal: AbortSignal | undefined,
            onUpdate:
                | AgentToolUpdateCallback<BashToolDetails | undefined>
                | undefined,
            ctx: ExtensionContext,
        ): Promise<AgentToolResult<BashToolDetails | undefined>> {
            const localCwd = process.cwd();
            return createBashToolDefinition(localCwd, {
                operations: sandbox.getOps().bash,
            }).execute(id, params, signal, onUpdate, ctx);
        },

        renderCall(
            args: BashToolInput,
            theme: Theme,
            context: BashRenderContext,
        ) {
            const state = context.state;
            if (context.executionStarted && state.startedAt === undefined) {
                state.startedAt = Date.now();
                state.endedAt = undefined;
            }

            const command = args.command;
            const timeout = args.timeout;

            let timerSuffix = "";
            if (state.startedAt !== undefined) {
                const endTime = state.endedAt ?? Date.now();
                const duration = endTime - state.startedAt;
                if (duration >= 1000) {
                    timerSuffix =
                        " " + theme.fg("muted", formatDuration(duration));
                }
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

        renderResult(
            result: AgentToolResult<BashToolDetails | undefined>,
            { isPartial }: ToolRenderResultOptions,
            theme: Theme,
            context: BashRenderContext,
        ) {
            const state = context.state;
            state.startedAt ??= Date.now();

            if (isPartial && !state.interval) {
                state.interval = setInterval(() => context.invalidate(), 1000);
            }
            if (!isPartial || context.isError) {
                state.endedAt ??= Date.now();
                if (state.interval) {
                    clearInterval(state.interval);
                    state.interval = undefined;
                }
            }

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
                      .map((line) =>
                          theme.fg("toolOutput", replaceTabs(line)),
                      )
                : [];

            const warnings: string[] = [];
            if (details?.fullOutputPath) {
                warnings.push(`Full output: ${details.fullOutputPath}`);
            }
            if (details?.truncation?.truncated) {
                const truncation = details.truncation;
                if (truncation.truncatedBy === "lines") {
                    warnings.push(
                        `Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`,
                    );
                } else {
                    warnings.push(
                        `Truncated: ${truncation.outputLines} lines shown`,
                    );
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
                        const truncated = truncateToVisualLines(
                            styledOutput,
                            BASH_PREVIEW_LINES,
                            width,
                        );
                        if (truncated.skippedCount > 0) {
                            const hint =
                                theme.fg(
                                    "muted",
                                    `... (${truncated.skippedCount} earlier lines,`,
                                ) +
                                ` ${keyHint("app.tools.expand", "to expand")})`;
                            lines.push(hint, ...truncated.visualLines);
                        } else {
                            lines.push(...truncated.visualLines);
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
