import { constants, existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
    ExtensionUIContext,
    ReadOperations,
} from "@earendil-works/pi-coding-agent";
import type {
    SandboxConfig,
    SandboxProvider,
    SandboxOps,
} from "./sandbox-shared";
import { assertReadSize } from "./sandbox-shared";
import { detectImageMimeFromBytes } from "./shared";

function isRunningInDocker(): boolean {
    return existsSync("/.dockerenv");
}

function createReadOps(): ReadOperations {
    return {
        async readFile(absolutePath) {
            const { size } = await fs.stat(absolutePath);
            assertReadSize(absolutePath, size);
            return fs.readFile(absolutePath);
        },
        access(absolutePath) {
            return fs.access(absolutePath, constants.R_OK);
        },
        async detectImageMimeType(absolutePath) {
            try {
                const fileHandle = await fs.open(absolutePath, "r");
                try {
                    const buffer = Buffer.alloc(16);
                    const { bytesRead } = await fileHandle.read(
                        buffer,
                        0,
                        buffer.length,
                        0,
                    );
                    return detectImageMimeFromBytes(
                        buffer.subarray(0, bytesRead),
                    );
                } finally {
                    await fileHandle.close();
                }
            } catch {
                return null;
            }
        },
    };
}

export function createDisabledSandbox(): SandboxProvider<SandboxConfig> {
    const readOps = createReadOps();

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
            return { read: readOps };
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

        getSharedTempDir(name: string) {
            const dir = join(tmpdir(), name);
            return { hostPath: dir, agentPath: dir };
        },
    };
}
