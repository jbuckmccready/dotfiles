import assert from "node:assert/strict";
import {
    chmodSync,
    mkdtempSync,
    mkdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { createPodmanSandbox } from "./podman-sandbox";
import { loadConfig } from "./sandbox-shared";

test("project config selects the Podman sandbox", () => {
    const root = mkdtempSync(path.join(tmpdir(), "pi-podman-config-test-"));
    const configDir = path.join(root, ".pi");
    mkdirSync(configDir);
    writeFileSync(
        path.join(configDir, "sandbox.json"),
        JSON.stringify({
            type: "podman",
            container: "configured-sandbox",
        }),
    );

    try {
        assert.deepEqual(loadConfig(root), {
            type: "podman",
            enabled: undefined,
            container: "configured-sandbox",
        });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("Podman sandbox inspects and opens the configured container", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "pi-podman-sandbox-test-"));
    const binDir = path.join(root, "bin");
    const cwd = path.join(root, "project");
    const skillsDir = path.join(
        homedir(),
        "dotfiles",
        "pi",
        ".pi",
        "agent",
        "skills",
    );
    mkdirSync(binDir);
    mkdirSync(cwd);

    const inspectOutput = JSON.stringify([
        {
            State: { Running: true },
            Mounts: [
                {
                    Type: "bind",
                    Source: cwd,
                    Destination: "/workspace",
                },
                {
                    Type: "bind",
                    Source: skillsDir,
                    Destination: "/home/agent/.pi/agent/skills",
                },
            ],
        },
    ]);
    const fakePodman = path.join(binDir, "podman");
    writeFileSync(
        fakePodman,
        [
            "#!/usr/bin/env bash",
            'if [[ "$1" == "inspect" && "$2" == "-f" ]]; then',
            "  printf 'true\\n'",
            'elif [[ "$1" == "inspect" ]]; then',
            `  printf '%s\\n' '${inspectOutput}'`,
            'elif [[ "$1" == "exec" ]]; then',
            "  exec bash",
            "else",
            "  exit 2",
            "fi",
        ].join("\n"),
    );
    chmodSync(fakePodman, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:${previousPath ?? ""}`;
    const statuses: string[] = [];
    const ui = {
        setStatus(_key: string, value: string) {
            statuses.push(value);
        },
        theme: {
            fg(_color: string, value: string) {
                return value;
            },
        },
    } as unknown as ExtensionUIContext;
    const sandbox = createPodmanSandbox();

    try {
        await sandbox.init(cwd, ui, {
            type: "podman",
        });

        assert.equal(sandbox.isActive(), true);
        assert.match(
            statuses.at(-1) ?? "",
            /Podman sandbox: pi-podman-sandbox/,
        );
        assert.deepEqual(sandbox.describe(), [
            "Sandbox: podman",
            "  Container: pi-podman-sandbox",
            "  Mounts (2):",
            `    ${cwd} → /workspace`,
            `    ${skillsDir} → /home/agent/.pi/agent/skills`,
        ]);
        assert.equal(sandbox.translatePath(cwd), "/workspace");
    } finally {
        await sandbox.shutdown();
        process.env.PATH = previousPath;
        rmSync(root, { recursive: true, force: true });
    }
});
