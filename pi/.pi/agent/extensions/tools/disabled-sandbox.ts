import type { ExtensionAPI, ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import type { SandboxConfig, SandboxProvider, SandboxOps } from "./sandbox-shared";

export function createDisabledSandbox(): SandboxProvider<SandboxConfig> {
    return {
        async init(_pi: ExtensionAPI, _cwd: string, ui: ExtensionUIContext, _config: SandboxConfig) {
            ui.setStatus(
                "sandbox",
                ui.theme.fg("warning", "⚠ Sandbox disabled"),
            );
        },
        async shutdown() {},
        isActive() {
            return false;
        },
        getOps(): SandboxOps {
            return {};
        },
    };
}
