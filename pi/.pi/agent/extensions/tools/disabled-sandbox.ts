import { existsSync } from "node:fs";
import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import type {
    SandboxConfig,
    SandboxProvider,
    SandboxOps,
} from "./sandbox-shared";

function isRunningInDocker(): boolean {
    return existsSync("/.dockerenv");
}

export function createDisabledSandbox(): SandboxProvider<SandboxConfig> {
    return {
        async init(
            _cwd: string,
            ui: ExtensionUIContext,
            _config: SandboxConfig,
        ) {
            if (isRunningInDocker()) {
                ui.setStatus(
                    "sandbox",
                    ui.theme.fg(
                        "accent",
                        "Sandbox disabled (Pi inside Docker)",
                    ),
                );
            } else {
                ui.setStatus(
                    "sandbox",
                    ui.theme.fg("warning", "⚠ Sandbox disabled"),
                );
            }
        },
        async shutdown() {},
        isActive() {
            return false;
        },
        getOps(): SandboxOps {
            return {};
        },
        describe() {
            return ["Sandbox: disabled"];
        },

        patchSystemPrompt(systemPrompt: string) {
            return systemPrompt;
        },

        translatePath(hostPath: string) {
            return hostPath;
        },
    };
}
