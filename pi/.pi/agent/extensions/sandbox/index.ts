/**
 * Sandbox Extension - OS-level sandboxing for bash commands
 *
 * Originally based on the official Pi sandbox extension example:
 * https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/sandbox/index.ts
 *
 * Original implementation: Pi maintainers (@mariozechner and contributors).
 *
 * Modified in this repository:
 * - Added `commandEnv` config support for sandboxed command env overrides
 * - Added shared cache defaults under `~/.pi/sandbox-cache` (npm, bun, pnpm, pip, uv, zig, go, rust, xdg cache/data)
 * - Added per-command `CLAUDE_TMPDIR` alignment before `wrapWithSandbox()` so sandbox TMPDIR follows config (`/tmp` by default)
 * - Added command-env details to `/sandbox` output
 * - Expanded default sandbox filesystem/network settings for local development
 *
 * Uses @anthropic-ai/sandbox-runtime to enforce filesystem and network
 * restrictions on bash commands at the OS level (sandbox-exec on macOS,
 * bubblewrap on Linux).
 *
 * Config files (merged, project takes precedence):
 * - ~/.pi/agent/sandbox.json (global)
 * - <cwd>/.pi/sandbox.json (project-local)
 *
 * Example .pi/sandbox.json:
 * ```json
 * {
 *   "enabled": true,
 *   "network": {
 *     "allowedDomains": ["github.com", "*.github.com"],
 *     "deniedDomains": []
 *   },
 *   "filesystem": {
 *     "denyRead": ["~/.ssh", "~/.aws"],
 *     "allowWrite": [".", "/tmp"],
 *     "denyWrite": [".env"]
 *   },
 *   "commandEnv": {
 *     "BUN_INSTALL_CACHE_DIR": "~/.pi/sandbox-cache/bun"
 *   }
 * }
 * ```
 *
 * Usage:
 * - `pi -e ./sandbox` - sandbox enabled with default/config settings
 * - `pi -e ./sandbox --no-sandbox` - disable sandboxing
 * - `/sandbox` - show current sandbox configuration
 *
 * Setup:
 * Run `npm install` in this directory
 *
 * Linux also requires: bubblewrap, socat, ripgrep
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
    SandboxManager,
    type SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
    type BashOperations,
    createBashTool,
} from "@mariozechner/pi-coding-agent";
import { Text, truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { getSanitizedTextOutput } from "../../extensions_lib/tool-output";

function makeSep(borderAnsi: string, width: number): string {
    return borderAnsi + "─".repeat(width) + "\x1b[39m";
}

function component(renderFn: (width: number) => string[]) {
    let cachedWidth: number | undefined;
    let cachedLines: string[] | undefined;
    return {
        invalidate() {
            cachedWidth = undefined;
            cachedLines = undefined;
        },
        render(width: number) {
            if (cachedLines && cachedWidth === width) return cachedLines;
            cachedLines = renderFn(width).map((l) =>
                truncateToWidth(l, width),
            );
            cachedWidth = width;
            return cachedLines;
        },
    } as any;
}

interface SandboxConfig extends SandboxRuntimeConfig {
    enabled?: boolean;
    // Extra environment variables injected into sandboxed bash commands.
    // Can be used to override default cache variables.
    commandEnv?: Record<string, string>;
}

const DEFAULT_CONFIG: SandboxConfig = {
    enabled: true,
    network: {
        allowedDomains: [
            "npmjs.org",
            "*.npmjs.org",
            "registry.npmjs.org",
            "registry.yarnpkg.com",
            "pypi.org",
            "*.pypi.org",
            "files.pythonhosted.org",
            "anthropic.com",
            "*.anthropic.com",
            "github.com",
            "*.github.com",
            "api.github.com",
            "raw.githubusercontent.com",
        ],
        allowUnixSockets: [
            ...(process.env.SSH_AUTH_SOCK ? [process.env.SSH_AUTH_SOCK] : []),
        ],
        // NOTE: this one is somewhat dangerous, when set to true, the domain name
        // restrictions can be bypassed by just unsetting proxy env vars (tested on MacOS)
        // https://github.com/anthropic-experimental/sandbox-runtime/issues/88
        allowLocalBinding: false,
        deniedDomains: [],
    },
    filesystem: {
        denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"],
        // NOTE: Global user caches are excluded to prevent the agent from
        // poisoning caches used outside the sandbox. Sandboxed bash commands
        // are automatically configured to use ~/.pi/sandbox-cache for package
        // manager/build caches, while TMPDIR uses /tmp.
        allowWrite: [
            ".",
            "/tmp",
            // Required for MacOS as /tmp is symlink to /private/tmp
            "/private/tmp",
            // Shared global cache directory for sandbox to use without risking poisoning
            // caches used outside the sandbox
            "~/.pi/sandbox-cache",
        ],
        denyWrite: [
            ".env",
            ".env.*",
            "*.pem",
            "*.key",
            // Prevent pi from tampering with its own sandbox config
            ".pi/sandbox.json",
        ],
    },
};

const SANDBOX_CACHE_ROOT = join(homedir(), ".pi", "sandbox-cache");

function getDefaultCacheEnv(cacheRoot: string): Record<string, string> {
    const npmCache = join(cacheRoot, "npm");
    const bunCache = join(cacheRoot, "bun");
    const pnpmStore = join(cacheRoot, "pnpm-store");
    const yarnCache = join(cacheRoot, "yarn");
    const pipCache = join(cacheRoot, "pip");
    const uvCache = join(cacheRoot, "uv");
    const zigLocalCache = join(cacheRoot, "zig-local");
    const zigGlobalCache = join(cacheRoot, "zig-global");
    const goBuildCache = join(cacheRoot, "go-build");
    const goModCache = join(cacheRoot, "go-mod");
    const cargoHome = join(cacheRoot, "cargo");
    const rustupHome = join(cacheRoot, "rustup");
    const xdgCache = join(cacheRoot, "xdg");
    const xdgData = join(cacheRoot, "xdg-data");

    return {
        TMPDIR: "/tmp",
        npm_config_cache: npmCache,
        NPM_CONFIG_CACHE: npmCache,
        BUN_INSTALL_CACHE_DIR: bunCache,
        PNPM_STORE_DIR: pnpmStore,
        YARN_CACHE_FOLDER: yarnCache,
        PIP_CACHE_DIR: pipCache,
        UV_CACHE_DIR: uvCache,
        ZIG_LOCAL_CACHE_DIR: zigLocalCache,
        ZIG_GLOBAL_CACHE_DIR: zigGlobalCache,
        GOCACHE: goBuildCache,
        GOMODCACHE: goModCache,
        CARGO_HOME: cargoHome,
        RUSTUP_HOME: rustupHome,
        XDG_CACHE_HOME: xdgCache,
        XDG_DATA_HOME: xdgData,
    };
}

function expandHomeDir(value: string): string {
    if (value === "~") return homedir();
    if (value.startsWith("~/")) return join(homedir(), value.slice(2));
    return value;
}

function getSandboxCommandEnv(config: SandboxConfig): Record<string, string> {
    const defaultCacheEnv = getDefaultCacheEnv(SANDBOX_CACHE_ROOT);
    const expandedConfigEnv: Record<string, string> = {};

    for (const [key, value] of Object.entries(config.commandEnv ?? {})) {
        expandedConfigEnv[key] = expandHomeDir(value);
    }

    return {
        ...defaultCacheEnv,
        ...expandedConfigEnv,
    };
}

function loadConfig(cwd: string): SandboxConfig {
    const projectConfigPath = join(cwd, ".pi", "sandbox.json");
    const globalConfigPath = join(homedir(), ".pi", "agent", "sandbox.json");

    let globalConfig: Partial<SandboxConfig> = {};
    let projectConfig: Partial<SandboxConfig> = {};

    if (existsSync(globalConfigPath)) {
        try {
            globalConfig = JSON.parse(readFileSync(globalConfigPath, "utf-8"));
        } catch (e) {
            console.error(`Warning: Could not parse ${globalConfigPath}: ${e}`);
        }
    }

    if (existsSync(projectConfigPath)) {
        try {
            projectConfig = JSON.parse(
                readFileSync(projectConfigPath, "utf-8"),
            );
        } catch (e) {
            console.error(
                `Warning: Could not parse ${projectConfigPath}: ${e}`,
            );
        }
    }

    return deepMerge(deepMerge(DEFAULT_CONFIG, globalConfig), projectConfig);
}

function deepMerge(
    base: SandboxConfig,
    overrides: Partial<SandboxConfig>,
): SandboxConfig {
    const result: SandboxConfig = { ...base };

    if (overrides.enabled !== undefined) result.enabled = overrides.enabled;
    if (overrides.network) {
        result.network = { ...base.network, ...overrides.network };
    }
    if (overrides.filesystem) {
        result.filesystem = { ...base.filesystem, ...overrides.filesystem };
    }

    const extOverrides = overrides as {
        ignoreViolations?: Record<string, string[]>;
        enableWeakerNestedSandbox?: boolean;
        commandEnv?: Record<string, string>;
    };
    const extResult = result as {
        ignoreViolations?: Record<string, string[]>;
        enableWeakerNestedSandbox?: boolean;
        commandEnv?: Record<string, string>;
    };

    if (extOverrides.ignoreViolations) {
        extResult.ignoreViolations = extOverrides.ignoreViolations;
    }
    if (extOverrides.enableWeakerNestedSandbox !== undefined) {
        extResult.enableWeakerNestedSandbox =
            extOverrides.enableWeakerNestedSandbox;
    }
    if (extOverrides.commandEnv) {
        extResult.commandEnv = {
            ...(base.commandEnv ?? {}),
            ...extOverrides.commandEnv,
        };
    }

    return result;
}

function createSandboxedBashOps(config: SandboxConfig): BashOperations {
    const commandEnv = getSandboxCommandEnv(config);
    const sandboxTmpDir = commandEnv.TMPDIR || "/tmp";

    return {
        async exec(command, cwd, { onData, signal, timeout }) {
            if (!existsSync(cwd)) {
                throw new Error(`Working directory does not exist: ${cwd}`);
            }

            // sandbox-runtime injects TMPDIR based on CLAUDE_TMPDIR.
            // Keep it aligned with our configured TMPDIR.
            process.env.CLAUDE_TMPDIR = sandboxTmpDir;

            const wrappedCommand =
                await SandboxManager.wrapWithSandbox(command);

            return new Promise((resolve, reject) => {
                const child = spawn("bash", ["-c", wrappedCommand], {
                    cwd,
                    detached: true,
                    stdio: ["ignore", "pipe", "pipe"],
                    env: {
                        ...process.env,
                        ...commandEnv,
                    },
                });

                let timedOut = false;
                let timeoutHandle: NodeJS.Timeout | undefined;

                if (timeout !== undefined && timeout > 0) {
                    timeoutHandle = setTimeout(() => {
                        timedOut = true;
                        if (child.pid) {
                            try {
                                process.kill(-child.pid, "SIGKILL");
                            } catch {
                                child.kill("SIGKILL");
                            }
                        }
                    }, timeout * 1000);
                }

                child.stdout?.on("data", onData);
                child.stderr?.on("data", onData);

                child.on("error", (err) => {
                    if (timeoutHandle) clearTimeout(timeoutHandle);
                    reject(err);
                });

                const onAbort = () => {
                    if (child.pid) {
                        try {
                            process.kill(-child.pid, "SIGKILL");
                        } catch {
                            child.kill("SIGKILL");
                        }
                    }
                };

                signal?.addEventListener("abort", onAbort, { once: true });

                child.on("close", (code) => {
                    if (timeoutHandle) clearTimeout(timeoutHandle);
                    signal?.removeEventListener("abort", onAbort);

                    if (signal?.aborted) {
                        reject(new Error("aborted"));
                    } else if (timedOut) {
                        reject(new Error(`timeout:${timeout}`));
                    } else {
                        resolve({ exitCode: code });
                    }
                });
            });
        },
    };
}

export default function (pi: ExtensionAPI) {
    pi.registerFlag("no-sandbox", {
        description: "Disable OS-level sandboxing for bash commands",
        type: "boolean",
        default: false,
    });

    const localCwd = process.cwd();
    const localBash = createBashTool(localCwd);
    const bashCache = new WeakMap<object, ReturnType<typeof component>>();

    let sandboxEnabled = false;
    let sandboxInitialized = false;
    let activeConfig: SandboxConfig = DEFAULT_CONFIG;

    pi.registerTool({
        ...localBash,
        label: "bash (sandboxed)",
        async execute(id, params, signal, onUpdate, _ctx) {
            if (!sandboxEnabled || !sandboxInitialized) {
                return localBash.execute(id, params, signal, onUpdate);
            }

            const sandboxedBash = createBashTool(localCwd, {
                operations: createSandboxedBashOps(activeConfig),
            });
            return sandboxedBash.execute(id, params, signal, onUpdate);
        },

        renderCall(args: any, theme: any) {
            const command = args?.command as string | undefined;
            const timeout = args?.timeout as number | undefined;
            const timeoutSuffix = timeout
                ? theme.fg("muted", ` (timeout ${timeout}s)`)
                : "";
            const commandDisplay = command
                ? command
                : theme.fg("toolOutput", "...");
            const title =
                theme.fg("toolTitle", theme.bold(`$ ${commandDisplay}`)) +
                timeoutSuffix;
            return component((width) => wrapTextWithAnsi(title, width));
        },

        renderResult(result: any, { expanded, isPartial }: any, theme: any) {
            if (isPartial) {
                return new Text(theme.fg("warning", "Running..."), 0, 0);
            }

            const details = result.details;
            if (details) {
                const cached = bashCache.get(details);
                if (cached) return cached;
            }

            const output = getSanitizedTextOutput(result).trim();
            const borderAnsi = theme.getFgAnsi("borderMuted");

            const outputLines = output
                ? output
                      .split("\n")
                      .map((l: string) => theme.fg("toolOutput", l))
                : [];

            const warnings: string[] = [];
            if (details?.fullOutputPath) {
                warnings.push(`Full output: ${details.fullOutputPath}`);
            }
            if (details?.truncation?.truncated) {
                const t = details.truncation;
                if (t.truncatedBy === "lines") {
                    warnings.push(
                        `Truncated: showing ${t.outputLines} of ${t.totalLines} lines`,
                    );
                } else {
                    warnings.push(
                        `Truncated: ${t.outputLines} lines shown`,
                    );
                }
            }
            const warningLine =
                warnings.length > 0
                    ? theme.fg("warning", `[${warnings.join(". ")}]`)
                    : null;

            const comp = component((width) => {
                const lines: string[] = [];
                if (outputLines.length > 0) {
                    const maxLines = expanded ? outputLines.length : 5;
                    const display = outputLines.slice(0, maxLines);
                    const remaining = outputLines.length - maxLines;
                    lines.push(makeSep(borderAnsi, width), ...display);
                    if (remaining > 0) {
                        lines.push(
                            theme.fg("muted", `... (${remaining} more lines)`),
                        );
                    }
                }
                if (warningLine) lines.push("", warningLine);
                lines.push(makeSep(borderAnsi, width));
                return lines;
            });
            if (details) bashCache.set(details, comp);
            return comp;
        },
    });

    pi.on("user_bash", () => {
        if (!sandboxEnabled || !sandboxInitialized) return;
        return { operations: createSandboxedBashOps(activeConfig) };
    });

    pi.on("session_start", async (_event, ctx) => {
        const noSandbox = pi.getFlag("no-sandbox") as boolean;

        if (noSandbox) {
            sandboxEnabled = false;
            ctx.ui.notify("Sandbox disabled via --no-sandbox", "warning");
            return;
        }

        const config = loadConfig(ctx.cwd);
        activeConfig = config;

        if (!config.enabled) {
            sandboxEnabled = false;
            ctx.ui.notify("Sandbox disabled via config", "info");
            return;
        }

        const platform = process.platform;
        if (platform !== "darwin" && platform !== "linux") {
            sandboxEnabled = false;
            ctx.ui.notify(`Sandbox not supported on ${platform}`, "warning");
            return;
        }

        try {
            const configExt = config as unknown as {
                ignoreViolations?: Record<string, string[]>;
                enableWeakerNestedSandbox?: boolean;
            };

            await SandboxManager.initialize({
                network: config.network,
                filesystem: config.filesystem,
                ignoreViolations: configExt.ignoreViolations,
                enableWeakerNestedSandbox: configExt.enableWeakerNestedSandbox,
            });

            sandboxEnabled = true;
            sandboxInitialized = true;

            const networkCount = config.network?.allowedDomains?.length ?? 0;
            const writeCount = config.filesystem?.allowWrite?.length ?? 0;
            ctx.ui.setStatus(
                "sandbox",
                ctx.ui.theme.fg(
                    "accent",
                    `🔒 Sandbox: ${networkCount} domains, ${writeCount} write paths`,
                ),
            );
            ctx.ui.notify("Sandbox initialized", "info");
        } catch (err) {
            sandboxEnabled = false;
            ctx.ui.notify(
                `Sandbox initialization failed: ${err instanceof Error ? err.message : err}`,
                "error",
            );
        }
    });

    pi.on("session_shutdown", async () => {
        if (sandboxInitialized) {
            try {
                await SandboxManager.reset();
            } catch {
                // Ignore cleanup errors
            }
        }
    });

    pi.registerCommand("sandbox", {
        description: "Show sandbox configuration",
        handler: async (_args, ctx) => {
            if (!sandboxEnabled) {
                ctx.ui.notify("Sandbox is disabled", "info");
                return;
            }

            const config = loadConfig(ctx.cwd);
            const commandEnv = getSandboxCommandEnv(config);
            const lines = [
                "Sandbox Configuration:",
                "",
                "Network:",
                `  Allowed: ${config.network?.allowedDomains?.join(", ") || "(none)"}`,
                `  Denied: ${config.network?.deniedDomains?.join(", ") || "(none)"}`,
                "",
                "Filesystem:",
                `  Deny Read: ${config.filesystem?.denyRead?.join(", ") || "(none)"}`,
                `  Allow Write: ${config.filesystem?.allowWrite?.join(", ") || "(none)"}`,
                `  Deny Write: ${config.filesystem?.denyWrite?.join(", ") || "(none)"}`,
                "",
                "Command Env:",
                `  Cache Root: ${SANDBOX_CACHE_ROOT}`,
                `  TMPDIR: ${commandEnv.TMPDIR || "(unset)"}`,
                `  CLAUDE_TMPDIR (process): ${process.env.CLAUDE_TMPDIR || "(unset)"}`,
                `  Variables: ${Object.keys(commandEnv).join(", ") || "(none)"}`,
            ];
            ctx.ui.notify(lines.join("\n"), "info");
        },
    });
}
