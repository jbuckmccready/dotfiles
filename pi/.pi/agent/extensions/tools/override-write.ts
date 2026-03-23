import {
    createWriteToolDefinition,
    type AgentToolResult,
    type AgentToolUpdateCallback,
    type ExtensionContext,
    type Theme,
    type WriteToolInput,
} from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { component, shortenPath } from "./shared";
import type { SandboxAPI } from "./sandbox-shared";
import { getToolViewMode, type ToolViewMode } from "./tool-view-mode";

type WriteRenderArgs = WriteToolInput & { file_path?: string };

type WriteRenderState = {
    lastCallMode?: ToolViewMode;
};

type WriteRenderContext = {
    args: WriteRenderArgs;
    toolCallId: string;
    invalidate: () => void;
    lastComponent: Component | undefined;
    state: WriteRenderState;
    cwd: string;
    executionStarted: boolean;
    argsComplete: boolean;
    isPartial: boolean;
    expanded: boolean;
    showImages: boolean;
    isError: boolean;
};

function renderMinimalWriteCall(args: WriteRenderArgs, theme: Theme) {
    const rawPath = args.file_path ?? args.path;
    const path = rawPath ? shortenPath(rawPath.replace(/^@/, "")) : "...";
    const pathDisplay = rawPath
        ? theme.fg("accent", path)
        : theme.fg("toolOutput", "...");
    const title = `${theme.fg("toolTitle", theme.bold("write"))} ${pathDisplay}`;
    return component((width) => wrapTextWithAnsi(title, width));
}

export function createWriteOverride(sandbox: SandboxAPI) {
    const builtinWrite = createWriteToolDefinition(process.cwd());

    return {
        execute(
            toolCallId: string,
            params: WriteToolInput,
            signal: AbortSignal | undefined,
            onUpdate: AgentToolUpdateCallback<undefined> | undefined,
            ctx: ExtensionContext,
        ): Promise<AgentToolResult<undefined>> {
            return createWriteToolDefinition(sandbox.translatePath(ctx.cwd), {
                operations: sandbox.getOps().write,
            }).execute(toolCallId, params, signal, onUpdate, ctx);
        },

        renderCall(
            args: WriteRenderArgs,
            theme: Theme,
            context: WriteRenderContext,
        ) {
            const mode = getToolViewMode();
            const state = context.state;
            const lastCallMode = state.lastCallMode;
            state.lastCallMode = mode;

            if (mode === "minimal") {
                return renderMinimalWriteCall(args, theme);
            }

            return builtinWrite.renderCall!(args, theme, {
                ...context,
                expanded: mode === "expanded",
                lastComponent:
                    lastCallMode && lastCallMode !== "minimal"
                        ? context.lastComponent
                        : undefined,
            });
        },
    };
}
