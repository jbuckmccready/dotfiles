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

export default function (pi: ExtensionAPI) {
    const sandbox = initSandbox(pi);
    const cwd = process.cwd();

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
