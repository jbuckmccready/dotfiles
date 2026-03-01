import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
    loadConfig,
    type SandboxProvider,
    type SandboxAPI,
    type OsSandboxConfig,
    type SandboxConfig,
} from "./sandbox-shared";
import { createDisabledSandbox } from "./disabled-sandbox";
import { createGondolinSandbox } from "./gondolin-sandbox";
import { createOsSandbox } from "./os-sandbox";

export function initSandbox(pi: ExtensionAPI): SandboxAPI {
    let provider: SandboxProvider<any> = createDisabledSandbox();

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
            await provider.init(pi, ctx.cwd, ctx.ui, { type: "disabled" });
            const msg = err instanceof Error ? err.message : String(err);
            ctx.ui.setStatus(
                "sandbox",
                ctx.ui.theme.fg("error", `⚠ Sandbox: config error — ${msg}`),
            );
            return;
        }

        if (noSandbox || config.enabled === false) {
            provider = createDisabledSandbox();
            await provider.init(pi, ctx.cwd, ctx.ui, config);
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
                    await provider.init(pi, ctx.cwd, ctx.ui, config);
                    ctx.ui.notify("Sandbox disabled via config", "info");
                    break;
                }
                case "gondolin": {
                    provider = createGondolinSandbox();
                    await provider.init(pi, ctx.cwd, ctx.ui, config);
                    ctx.ui.notify("Gondolin sandbox initialized", "info");
                    break;
                }
                default: {
                    provider = createOsSandbox();
                    await provider.init(pi, ctx.cwd, ctx.ui, config);
                    ctx.ui.notify("Sandbox initialized", "info");
                    break;
                }
            }
        } catch (err) {
            provider = createDisabledSandbox();
            await provider.init(pi, ctx.cwd, ctx.ui, config);
            ctx.ui.notify(
                `Sandbox initialization failed: ${err instanceof Error ? err.message : err}`,
                "error",
            );
        }
    });

    pi.on("session_shutdown", async () => {
        await provider.shutdown();
    });

    pi.registerCommand("sandbox", {
        description: "Show sandbox configuration",
        handler: async (_args, ctx) => {
            if (!provider.isActive()) {
                ctx.ui.notify("Sandbox is disabled", "info");
                return;
            }

            const config = loadConfig(ctx.cwd);
            const lines: string[] = [];

            switch (config.type) {
                case "gondolin": {
                    lines.push(
                        "Sandbox: gondolin",
                        `  Guest Dir: ${config.guestDir || "(default)"}`,
                        `  Allowed Hosts: ${config.allowedHosts?.join(", ") || "(none)"}`,
                        `  Secrets: ${Object.keys(config.secrets ?? {}).join(", ") || "(none)"}`,
                        `  Exclude Paths: ${config.excludePaths?.join(", ") || "(none)"}`,
                    );
                    break;
                }
                default: {
                    const os = config as OsSandboxConfig;
                    lines.push(
                        "Sandbox: os",
                        "",
                        "Network:",
                        `  Allowed: ${os.network?.allowedDomains?.join(", ") || "(none)"}`,
                        `  Denied: ${os.network?.deniedDomains?.join(", ") || "(none)"}`,
                        "",
                        "Filesystem:",
                        `  Deny Read: ${os.filesystem?.denyRead?.join(", ") || "(none)"}`,
                        `  Allow Write: ${os.filesystem?.allowWrite?.join(", ") || "(none)"}`,
                        `  Deny Write: ${os.filesystem?.denyWrite?.join(", ") || "(none)"}`,
                    );
                    break;
                }
            }

            ctx.ui.notify(lines.join("\n"), "info");
        },
    });

    return {
        isActive() {
            return provider.isActive();
        },
        getOps() {
            return provider.getOps();
        },
    };
}
