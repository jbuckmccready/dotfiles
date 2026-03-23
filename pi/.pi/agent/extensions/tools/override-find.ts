import {
    createFindTool,
    type AgentToolResult,
    type AgentToolUpdateCallback,
    type ExtensionContext,
    type FindToolDetails,
    type FindToolInput,
    type Theme,
    type ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { Text, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import {
    component,
    shortenPath,
    getSanitizedTextOutput,
    replaceTabs,
} from "./shared";
import type { SandboxAPI } from "./sandbox-shared";
import { getToolViewMode, type ToolViewMode } from "./tool-view-mode";

type CompCache = Partial<Record<ToolViewMode, Component>>;

export function createFindOverride(sandbox: SandboxAPI) {
    const findCache = new WeakMap<object, CompCache>();

    return {
        execute(
            toolCallId: string,
            params: FindToolInput,
            signal: AbortSignal | undefined,
            onUpdate:
                | AgentToolUpdateCallback<FindToolDetails | undefined>
                | undefined,
            ctx: ExtensionContext,
        ): Promise<AgentToolResult<FindToolDetails | undefined>> {
            return createFindTool(sandbox.translatePath(ctx.cwd), {
                operations: sandbox.getOps().find,
            }).execute(toolCallId, params, signal, onUpdate);
        },

        renderCall(args: FindToolInput, theme: Theme) {
            const pattern = args.pattern;
            const rawPath = args.path || ".";
            const path = shortenPath(rawPath);
            const limit = args.limit;

            let title =
                theme.fg("toolTitle", theme.bold("find")) +
                " " +
                theme.fg("accent", pattern || "") +
                theme.fg("toolOutput", ` in ${path}`);
            if (limit !== undefined) {
                title += theme.fg("toolOutput", ` (limit ${limit})`);
            }

            return component((width) => wrapTextWithAnsi(title, width));
        },

        renderResult(
            result: AgentToolResult<FindToolDetails | undefined>,
            { isPartial }: ToolRenderResultOptions,
            theme: Theme,
        ) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Searching..."), 0, 0);
            }

            const details = result.details;
            const mode = getToolViewMode();
            if (details) {
                const cached = findCache.get(details)?.[mode];
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

            const comp = component(() => {
                if (mode === "minimal") return [];
                const lines: string[] = [];
                if (outputLines.length > 0) {
                    const maxLines =
                        mode === "expanded" ? outputLines.length : 20;
                    const display = outputLines.slice(0, maxLines);
                    const remaining = outputLines.length - maxLines;
                    lines.push(...display);
                    if (remaining > 0) {
                        lines.push(
                            theme.fg("muted", `... (${remaining} more lines)`),
                        );
                    }
                }
                if (warningLine) lines.push("", warningLine);
                return lines;
            });
            if (details) {
                const pair = findCache.get(details) || {};
                pair[mode] = comp;
                findCache.set(details, pair);
            }
            return comp;
        },
    };
}
