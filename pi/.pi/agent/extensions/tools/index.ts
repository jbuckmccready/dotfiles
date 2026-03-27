import type {
    ExtensionAPI,
    ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import {
    createReadToolDefinition,
    createGrepToolDefinition,
    createWriteToolDefinition,
    createFindToolDefinition,
    createLsToolDefinition,
    createEditToolDefinition,
    createBashToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { initSandbox } from "./sandbox";
import { createReadOverride } from "./override-read";
import { createGrepOverride } from "./override-grep";
import { createWriteOverride } from "./override-write";
import { createFindOverride } from "./override-find";
import { createLsOverride } from "./override-ls";
import { createEditOverride } from "./override-edit";
import { createBashOverride } from "./override-bash";
import {
    type ToolViewMode,
    getToolViewMode,
    setToolViewMode,
    cycleToolViewMode,
    toolViewModeExpanded,
} from "./tool-view-mode";

const MODE_LABELS: Record<ToolViewMode, string> = {
    minimal: "◈ minimal",
    condensed: "◇ condensed",
    expanded: "◆ expanded",
};

function withBuiltinMetadata(
    builtin: ToolDefinition<any, any, any>,
    override: Record<string, unknown>,
): ToolDefinition<any, any, any> {
    return {
        name: builtin.name,
        label: builtin.label,
        description: builtin.description,
        promptSnippet: builtin.promptSnippet,
        promptGuidelines: builtin.promptGuidelines,
        parameters: builtin.parameters,
        ...override,
    } as unknown as ToolDefinition<any, any, any>;
}

function syncMode(pi: ExtensionAPI) {
    const mode = getToolViewMode();
    pi.events.emit("tool-view-mode", mode);
}

type ToolViewModeContext = {
    ui: {
        setToolsExpanded: (expanded: boolean) => void;
        setStatus: (key: string, value: string) => void;
    };
};

export default function (pi: ExtensionAPI) {
    const sandbox = initSandbox(pi);
    const cwd = process.cwd();

    // --- Tool view mode: command + shortcut + status ---

    function applyMode(ctx: ToolViewModeContext) {
        const mode = getToolViewMode();
        syncMode(pi);
        ctx.ui.setToolsExpanded(toolViewModeExpanded());
        ctx.ui.setStatus("tool-view", MODE_LABELS[mode]);
    }

    pi.on("session_start", async (_event, ctx) => {
        applyMode(ctx);
    });

    pi.registerCommand("tool-view", {
        description: "Set or cycle tool view mode (minimal | condensed | expanded)",
        getArgumentCompletions: (prefix: string) => {
            const modes: ToolViewMode[] = ["minimal", "condensed", "expanded"];
            const items = modes.map((m) => ({ value: m, label: m }));
            const filtered = items.filter((i) => i.value.startsWith(prefix));
            return filtered.length > 0 ? filtered : null;
        },
        handler: async (args, ctx) => {
            const arg = args?.trim();
            if (arg === "minimal" || arg === "condensed" || arg === "expanded") {
                setToolViewMode(arg);
            } else if (!arg) {
                cycleToolViewMode();
            } else {
                ctx.ui.notify(
                    `Unknown mode "${arg}". Use: minimal, condensed, expanded`,
                    "error",
                );
                return;
            }
            applyMode(ctx);
            ctx.ui.notify(`Tool view: ${getToolViewMode()}`, "info");
        },
    });

    pi.registerShortcut("ctrl+o", {
        description: "Cycle tool view mode (minimal → condensed → expanded)",
        handler: async (ctx) => {
            cycleToolViewMode();
            applyMode(ctx);
        },
    });

    // --- Tool overrides (unchanged wiring) ---

    const read = createReadOverride(sandbox);
    const builtinRead = createReadToolDefinition(cwd);
    pi.registerTool(withBuiltinMetadata(builtinRead, read));

    const grep = createGrepOverride(sandbox);
    const builtinGrep = createGrepToolDefinition(cwd);
    pi.registerTool(withBuiltinMetadata(builtinGrep, grep));

    const write = createWriteOverride(sandbox);
    const builtinWrite = createWriteToolDefinition(cwd);
    pi.registerTool(withBuiltinMetadata(builtinWrite, write));

    const find = createFindOverride(sandbox);
    const builtinFind = createFindToolDefinition(cwd);
    pi.registerTool(withBuiltinMetadata(builtinFind, find));

    const ls = createLsOverride(sandbox);
    const builtinLs = createLsToolDefinition(cwd);
    pi.registerTool(withBuiltinMetadata(builtinLs, ls));

    const edit = createEditOverride(sandbox);
    const builtinEdit = createEditToolDefinition(cwd);
    pi.registerTool(withBuiltinMetadata(builtinEdit, edit));

    const bash = createBashOverride(sandbox);
    const builtinBash = createBashToolDefinition(cwd);
    pi.registerTool(withBuiltinMetadata(builtinBash, bash));
}
