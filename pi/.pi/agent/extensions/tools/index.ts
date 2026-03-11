import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
    createReadTool,
    createGrepTool,
    createWriteTool,
    createFindTool,
    createLsTool,
    createEditTool,
    createBashTool,
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

function syncMode(pi: ExtensionAPI) {
    const mode = getToolViewMode();
    pi.events.emit("tool-view-mode", mode);
}

export default function (pi: ExtensionAPI) {
    const sandbox = initSandbox(pi);
    const cwd = process.cwd();

    // --- Tool view mode: command + shortcut + status ---

    function applyMode(ctx: any) {
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
    const builtinRead = createReadTool(cwd);
    pi.registerTool({
        name: "read",
        label: builtinRead.label,
        description: builtinRead.description,
        parameters: builtinRead.parameters,
        ...read,
    });

    const grep = createGrepOverride(sandbox);
    const builtinGrep = createGrepTool(cwd);
    pi.registerTool({
        name: "grep",
        label: builtinGrep.label,
        description: builtinGrep.description,
        parameters: builtinGrep.parameters,
        ...grep,
    });

    const write = createWriteOverride(sandbox);
    const builtinWrite = createWriteTool(cwd);
    pi.registerTool({
        name: "write",
        label: builtinWrite.label,
        description: builtinWrite.description,
        parameters: builtinWrite.parameters,
        ...write,
    });

    const find = createFindOverride(sandbox);
    const builtinFind = createFindTool(cwd);
    pi.registerTool({
        name: "find",
        label: builtinFind.label,
        description: builtinFind.description,
        parameters: builtinFind.parameters,
        ...find,
    });

    const ls = createLsOverride(sandbox);
    const builtinLs = createLsTool(cwd);
    pi.registerTool({
        name: "ls",
        label: builtinLs.label,
        description: builtinLs.description,
        parameters: builtinLs.parameters,
        ...ls,
    });

    const edit = createEditOverride(sandbox);
    const builtinEdit = createEditTool(cwd);
    pi.registerTool({
        name: "edit",
        label: builtinEdit.label,
        description: builtinEdit.description,
        parameters: builtinEdit.parameters,
        ...edit,
    });

    const bash = createBashOverride(sandbox);
    const builtinBash = createBashTool(cwd);
    pi.registerTool({
        name: "bash",
        label: builtinBash.label,
        description: builtinBash.description,
        parameters: builtinBash.parameters,
        ...bash,
    });
}
