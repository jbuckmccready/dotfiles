import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
    stripFrontmatter,
    type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import {
    loadConfig,
    type SandboxProvider,
    type SandboxAPI,
    type SandboxConfig,
} from "./sandbox-shared";
import { createDisabledSandbox } from "./disabled-sandbox";
import { createDockerSandbox } from "./docker-sandbox";
import { createGondolinSandbox } from "./gondolin-sandbox";
import { createOsSandbox } from "./os-sandbox";

function expandSkillCommandForSandbox(
    pi: ExtensionAPI,
    provider: SandboxProvider,
    text: string,
): string | undefined {
    if (!text.startsWith("/skill:")) return;

    const spaceIndex = text.indexOf(" ");
    const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
    const skillName = commandName.slice("skill:".length);
    const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim();

    const command = pi
        .getCommands()
        .find((entry) => entry.source === "skill" && entry.name === commandName);
    if (!command) return;

    const hostFilePath = command.sourceInfo.path;
    const hostBaseDir = dirname(hostFilePath);
    const guestFilePath = provider.translatePath(hostFilePath);
    const guestBaseDir = provider.translatePath(hostBaseDir);

    if (guestFilePath === hostFilePath && guestBaseDir === hostBaseDir) {
        return;
    }

    const content = readFileSync(hostFilePath, "utf-8");
    const body = stripFrontmatter(content).trim();
    const skillBlock = `<skill name="${skillName}" location="${guestFilePath}">\nReferences are relative to ${guestBaseDir}.\n\n${body}\n</skill>`;

    return args ? `${skillBlock}\n\n${args}` : skillBlock;
}

export function initSandbox(pi: ExtensionAPI): SandboxAPI {
    let provider: SandboxProvider = createDisabledSandbox();

    pi.registerFlag("no-sandbox", {
        description: "Disable OS-level sandboxing for bash commands",
        type: "boolean",
        default: false,
    });

    pi.on("user_bash", () => {
        const bashOps = provider.getOps().bash;
        if (!bashOps) return;
        return { operations: bashOps };
    });

    pi.on("session_start", async (_event, ctx) => {
        const noSandbox = pi.getFlag("no-sandbox") as boolean;

        let config: SandboxConfig;
        try {
            config = loadConfig(ctx.cwd);
        } catch (err) {
            provider = createDisabledSandbox();
            await provider.init(ctx.cwd, ctx.ui, { type: "disabled" });
            const msg = err instanceof Error ? err.message : String(err);
            ctx.ui.setStatus(
                "sandbox",
                ctx.ui.theme.fg("error", `⚠ Sandbox: config error — ${msg}`),
            );
            return;
        }

        if (noSandbox || config.enabled === false) {
            provider = createDisabledSandbox();
            await provider.init(ctx.cwd, ctx.ui, config);
            ctx.ui.notify(
                noSandbox
                    ? "Sandbox disabled via --no-sandbox"
                    : "Sandbox disabled via config",
                noSandbox ? "warning" : "info",
            );
            return;
        }

        try {
            switch (config.type) {
                case "disabled": {
                    provider = createDisabledSandbox();
                    await provider.init(ctx.cwd, ctx.ui, config);
                    ctx.ui.notify("Sandbox disabled via config", "info");
                    break;
                }
                case "gondolin": {
                    provider = createGondolinSandbox();
                    await provider.init(ctx.cwd, ctx.ui, config);
                    ctx.ui.notify("Gondolin sandbox initialized", "info");
                    break;
                }
                case "docker": {
                    provider = createDockerSandbox();
                    await provider.init(ctx.cwd, ctx.ui, config);
                    ctx.ui.notify("Docker sandbox initialized", "info");
                    break;
                }
                default: {
                    provider = createOsSandbox();
                    await provider.init(ctx.cwd, ctx.ui, config);
                    ctx.ui.notify("Sandbox initialized", "info");
                    break;
                }
            }
        } catch (err) {
            provider = createDisabledSandbox();
            await provider.init(ctx.cwd, ctx.ui, config);
            ctx.ui.notify(
                `Sandbox initialization failed: ${err instanceof Error ? err.message : err}`,
                "error",
            );
        }
    });

    pi.on("session_shutdown", async () => {
        await provider.shutdown();
    });

    pi.on("before_agent_start", async (event) => {
        const patched = provider.patchSystemPrompt(event.systemPrompt);
        if (patched !== event.systemPrompt) {
            return { systemPrompt: patched };
        }
    });

    pi.on("input", async (event) => {
        let expanded: string | undefined;
        try {
            expanded = expandSkillCommandForSandbox(pi, provider, event.text);
        } catch {
            return;
        }
        if (!expanded) return;
        return { action: "transform", text: expanded, images: event.images };
    });

    pi.registerCommand("sandbox", {
        description: "Show sandbox configuration",
        handler: async (_args, ctx) => {
            if (!provider.isActive()) {
                ctx.ui.notify("Sandbox is disabled", "info");
                return;
            }
            ctx.ui.notify(provider.describe().join("\n"), "info");
        },
    });

    return {
        isActive() {
            return provider.isActive();
        },
        getOps() {
            return provider.getOps();
        },
        translatePath(hostPath: string) {
            return provider.translatePath(hostPath);
        },
    };
}
