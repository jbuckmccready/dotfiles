/**
 * Docker Sandbox Extension - Docker-based sandboxing for bash commands
 *
 * Runs all bash commands inside a pre-existing Docker container via
 * `docker exec`. The container's own configuration (mounts, network,
 * user, etc.) controls what the agent can access.
 *
 * Config (global only, not project-local to prevent the sandbox from
 * modifying its own config):
 * - ~/.pi/agent/docker-sandbox.json
 *
 * Example ~/.pi/agent/docker-sandbox.json:
 * ```json
 * {
 *   "enabled": true,
 *   "container": "agent-sandbox",
 *   "mounts": {
 *     "~/workspace": "/workspace"
 *   }
 * }
 * ```
 *
 * The `mounts` map tells the extension how host paths map to container
 * paths. When pi runs from ~/workspace/myproject, the extension finds
 * the matching mount prefix and translates the cwd to /workspace/myproject
 * for `docker exec -w`.
 *
 * Corresponding docker run:
 *
 *   docker run -d --name agent-sandbox \
 *     -v ~/workspace:/workspace \
 *     node:22 sleep infinity
 *
 * Usage:
 * - `pi -e ./sandbox` - sandbox enabled with default/config settings
 * - `pi -e ./sandbox --no-sandbox` - disable sandboxing
 * - `/sandbox` - show current sandbox configuration
 *
 * Requirements:
 * - Docker installed and running
 * - A running container named "agent-sandbox" (or configured name)
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
    type BashOperations,
    createBashTool,
} from "@mariozechner/pi-coding-agent";

interface SandboxConfig {
    enabled?: boolean;
    container?: string;
    mounts?: Record<string, string>;
}

const DEFAULT_CONFIG: SandboxConfig = {
    enabled: true,
    container: "agent-sandbox",
};

function expandHomeDir(value: string): string {
    if (value === "~") return homedir();
    if (value.startsWith("~/")) return join(homedir(), value.slice(2));
    return value;
}

function loadConfig(): SandboxConfig {
    const configPath = join(homedir(), ".pi", "agent", "docker-sandbox.json");

    if (existsSync(configPath)) {
        try {
            const overrides = JSON.parse(readFileSync(configPath, "utf-8"));
            return { ...DEFAULT_CONFIG, ...overrides };
        } catch (e) {
            console.error(`Warning: Could not parse ${configPath}: ${e}`);
        }
    }

    return { ...DEFAULT_CONFIG };
}

function resolveContainerPath(
    hostPath: string,
    mounts: Record<string, string>,
): string | null {
    // Find the longest matching host prefix
    let bestHost = "";
    let bestContainer = "";

    for (const [hostMount, containerMount] of Object.entries(mounts)) {
        const expanded = expandHomeDir(hostMount);
        if (
            (hostPath === expanded || hostPath.startsWith(expanded + "/")) &&
            expanded.length > bestHost.length
        ) {
            bestHost = expanded;
            bestContainer = containerMount;
        }
    }

    if (!bestHost) return null;

    if (hostPath === bestHost) return bestContainer;
    return bestContainer + hostPath.slice(bestHost.length);
}

function isContainerRunning(container: string): boolean {
    try {
        const out = execSync(
            `docker inspect -f '{{.State.Running}}' ${container}`,
            { stdio: ["ignore", "pipe", "ignore"], timeout: 5000 },
        );
        return out.toString().trim() === "true";
    } catch {
        return false;
    }
}

function createDockerBashOps(
    container: string,
    mounts: Record<string, string>,
): BashOperations {
    return {
        async exec(command, cwd, { onData, signal, timeout }) {
            const execDir = resolveContainerPath(cwd, mounts) ?? cwd;

            return new Promise((resolve, reject) => {
                const child = spawn(
                    "docker",
                    ["exec", "-w", execDir, container, "bash", "-c", command],
                    { stdio: ["ignore", "pipe", "pipe"] },
                );

                let timedOut = false;
                let timeoutHandle: NodeJS.Timeout | undefined;

                if (timeout !== undefined && timeout > 0) {
                    timeoutHandle = setTimeout(() => {
                        timedOut = true;
                        child.kill("SIGKILL");
                    }, timeout * 1000);
                }

                child.stdout?.on("data", onData);
                child.stderr?.on("data", onData);

                child.on("error", (err) => {
                    if (timeoutHandle) clearTimeout(timeoutHandle);
                    reject(err);
                });

                const onAbort = () => child.kill("SIGKILL");
                signal?.addEventListener("abort", onAbort, { once: true });

                child.on("close", (code) => {
                    if (timeoutHandle) clearTimeout(timeoutHandle);
                    signal?.removeEventListener("abort", onAbort);
                    if (signal?.aborted) reject(new Error("aborted"));
                    else if (timedOut) reject(new Error(`timeout:${timeout}`));
                    else resolve({ exitCode: code });
                });
            });
        },
    };
}

export default function (pi: ExtensionAPI) {
    pi.registerFlag("no-sandbox", {
        description: "Disable Docker sandboxing for bash commands",
        type: "boolean",
        default: false,
    });

    const localCwd = process.cwd();
    const localBash = createBashTool(localCwd);

    let sandboxEnabled = false;
    let activeContainer: string | null = null;
    let activeMounts: Record<string, string> = {};

    const getOps = () => createDockerBashOps(activeContainer!, activeMounts);

    pi.registerTool({
        ...localBash,
        label: "bash (docker sandbox)",
        async execute(id, params, signal, onUpdate, _ctx) {
            if (!sandboxEnabled || !activeContainer) {
                return localBash.execute(id, params, signal, onUpdate);
            }
            const dockerBash = createBashTool(localCwd, {
                operations: getOps(),
            });
            return dockerBash.execute(id, params, signal, onUpdate);
        },
    });

    pi.on("user_bash", () => {
        if (!sandboxEnabled || !activeContainer) return;
        return { operations: getOps() };
    });

    pi.on("session_start", async (_event, ctx) => {
        const noSandbox = pi.getFlag("no-sandbox") as boolean;
        if (noSandbox) {
            sandboxEnabled = false;
            ctx.ui.notify("Sandbox disabled via --no-sandbox", "warning");
            return;
        }

        const config = loadConfig();

        if (!config.enabled) {
            sandboxEnabled = false;
            ctx.ui.notify("Sandbox disabled via config", "info");
            return;
        }

        const container = config.container ?? "agent-sandbox";

        if (!isContainerRunning(container)) {
            sandboxEnabled = false;
            ctx.ui.notify(
                `Docker container "${container}" is not running. Start it to use sandbox.`,
                "error",
            );
            return;
        }

        const mounts = config.mounts ?? {};
        const containerCwd = resolveContainerPath(ctx.cwd, mounts);

        if (Object.keys(mounts).length > 0 && !containerCwd) {
            sandboxEnabled = false;
            ctx.ui.notify(
                `Current directory "${ctx.cwd}" is not under any configured mount. Check mounts in docker-sandbox.json.`,
                "error",
            );
            return;
        }

        activeContainer = container;
        activeMounts = mounts;
        sandboxEnabled = true;

        const displayDir = containerCwd ?? ctx.cwd;
        ctx.ui.setStatus(
            "sandbox",
            ctx.ui.theme.fg(
                "accent",
                `🐳 Sandbox: ${container} (${displayDir})`,
            ),
        );
        ctx.ui.notify(`Docker sandbox active (${container})`, "info");
    });

    pi.on("before_agent_start", async (event) => {
        if (!sandboxEnabled || !activeMounts) return;
        const containerCwd = resolveContainerPath(localCwd, activeMounts);
        if (!containerCwd || containerCwd === localCwd) return;
        return {
            systemPrompt: event.systemPrompt.replace(
                `Current working directory: ${localCwd}`,
                `Current working directory: ${containerCwd} (docker: ${activeContainer})`,
            ),
        };
    });

    pi.registerCommand("sandbox", {
        description: "Show sandbox configuration",
        handler: async (_args, ctx) => {
            if (!sandboxEnabled || !activeContainer) {
                ctx.ui.notify("Sandbox is disabled", "info");
                return;
            }
            const containerCwd =
                resolveContainerPath(ctx.cwd, activeMounts) ?? ctx.cwd;
            const lines = [
                `Container: ${activeContainer}`,
                `Host cwd: ${ctx.cwd}`,
                `Container cwd: ${containerCwd}`,
                ...Object.entries(activeMounts).map(
                    ([h, c]) => `Mount: ${expandHomeDir(h)} → ${c}`,
                ),
            ];
            ctx.ui.notify(lines.join("\n"), "info");
        },
    });
}
