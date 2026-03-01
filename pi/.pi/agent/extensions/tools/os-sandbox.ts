/**
 * OS sandbox provider — runs pi tools on the host with sandbox-runtime enforcement.
 * This is expanded on the example extension in Pi:
 * https://github.com/badlogic/pi-mono/blob/95276df0608dabe8d443c3191fa8e391f9922cca/packages/coding-agent/examples/extensions/sandbox/index.ts
 * Only works on MacOS and Linux where sandbox-runtime is supported.
 *
 * Bash commands are wrapped with SandboxManager.wrapWithSandbox().
 * Read/write/edit/grep/find/ls operations also apply path checks so tool behavior
 * matches sandbox policies even when files are accessed directly from Node.
 *
 * Environment variables injected into commands allow for running tools that require write
 * access outside of the sandbox (e.g. compilers with cache dirs).
 *
 * Example ~/.pi/agent/sandbox.json:
 *
 *   {
 *     "type": "os",
 *     "network": {
 *       "allowedDomains": ["github.com", "*.github.com", "api.github.com"],
 *       "allowUnixSockets": ["~/.ssh/agent.sock"],
 *       "allowLocalBinding": false,
 *       "deniedDomains": []
 *     },
 *     "filesystem": {
 *       "denyRead": ["~/.ssh", "~/.aws"],
 *       "allowWrite": [".", "/tmp", "~/.pi/sandbox-cache"],
 *       "denyWrite": [".env", ".env.*", "*.pem", "*.key"]
 *     },
 *     "ignoreViolations": {},
 *     "enableWeakerNestedSandbox": false,
 *     "commandEnv": {
 *       "GOCACHE": "~/.pi/sandbox-cache/go-build"
 *     }
 *   }
 *
 * Config fields:
 *   network                     — outbound network policy passed to sandbox runtime.
 *   filesystem                  — read/write policy (denyRead/allowWrite/denyWrite).
 *   ignoreViolations            — optional per-check allowlist used by sandbox runtime.
 *   enableWeakerNestedSandbox   — relax nested sandbox behavior for specific host setups.
 *   commandEnv                  — env overrides for sandboxed bash commands (supports ~).
 */
import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { globSync } from "glob";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import type {
    BashOperations,
    ReadOperations,
    WriteOperations,
    EditOperations,
    GrepOperations,
    FindOperations,
    LsOperations,
} from "@mariozechner/pi-coding-agent";
import type {
    OsSandboxConfig,
    SandboxProvider,
    SandboxOps,
} from "./sandbox-shared";
import { detectImageMimeFromBytes } from "./shared";

const SANDBOX_CACHE_ROOT = join(homedir(), ".pi", "sandbox-cache");

function expandHomeDir(value: string): string {
    if (value === "~") return homedir();
    if (value.startsWith("~/")) return join(homedir(), value.slice(2));
    return value;
}

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

function getSandboxCommandEnv(
    osConfig: OsSandboxConfig,
): Record<string, string> {
    const defaultCacheEnv = getDefaultCacheEnv(SANDBOX_CACHE_ROOT);
    const expandedConfigEnv: Record<string, string> = {};

    for (const [key, value] of Object.entries(osConfig.commandEnv ?? {})) {
        expandedConfigEnv[key] = expandHomeDir(value);
    }

    return {
        ...defaultCacheEnv,
        ...expandedConfigEnv,
    };
}

// --- Path validation ---

function expandConfigPath(entry: string, cwd: string): string {
    let expanded: string;
    if (entry === ".") {
        expanded = cwd;
    } else if (entry.startsWith("~/") || entry === "~") {
        expanded = expandHomeDir(entry);
    } else if (entry.startsWith("/")) {
        expanded = entry;
    } else {
        expanded = join(cwd, entry);
    }

    // Resolve symlinks so comparisons match resolvePath() in assertions
    try {
        return realpathSync(expanded);
    } catch {
        return expanded;
    }
}

function isUnderDir(absolutePath: string, dir: string): boolean {
    const normalized = absolutePath.endsWith("/")
        ? absolutePath
        : absolutePath + "/";
    const normalizedDir = dir.endsWith("/") ? dir : dir + "/";
    return absolutePath === dir || normalized.startsWith(normalizedDir);
}

function matchesDenyWritePattern(
    absolutePath: string,
    pattern: string,
): boolean {
    const name = basename(absolutePath);

    // Exact basename match: ".env"
    if (!pattern.includes("*") && !pattern.includes("/")) {
        return name === pattern;
    }

    // Glob suffix: "*.pem", "*.key"
    if (pattern.startsWith("*.")) {
        const suffix = pattern.slice(1); // ".pem"
        return name.endsWith(suffix);
    }

    // Prefix+suffix: ".env.*"
    if (pattern.includes("*")) {
        const [prefix, suffix] = pattern.split("*");
        return name.startsWith(prefix) && name.endsWith(suffix);
    }

    // Path suffix: "path/file"
    return absolutePath.endsWith("/" + pattern) || absolutePath === pattern;
}

function resolvePath(absolutePath: string): string {
    try {
        return realpathSync(absolutePath);
    } catch {
        // File may not exist yet (e.g. writes). Resolve the parent directory.
        try {
            return join(
                realpathSync(join(absolutePath, "..")),
                basename(absolutePath),
            );
        } catch {
            return absolutePath;
        }
    }
}

function createFsOpenError(
    code: "ENOENT" | "EACCES",
    absolutePath: string,
): NodeJS.ErrnoException {
    const message =
        code === "ENOENT"
            ? `ENOENT: no such file or directory, open '${absolutePath}'`
            : `EACCES: permission denied, open '${absolutePath}'`;
    const err: NodeJS.ErrnoException = new Error(message);
    err.code = code;
    err.errno = code === "ENOENT" ? -2 : -13;
    err.syscall = "open";
    err.path = absolutePath;
    return err;
}

function assertReadAllowed(
    absolutePath: string,
    denyReadResolved: string[],
): void {
    const resolved = resolvePath(absolutePath);
    for (const denied of denyReadResolved) {
        if (isUnderDir(resolved, denied)) {
            throw createFsOpenError("ENOENT", absolutePath);
        }
    }
}

function assertWriteAllowed(
    absolutePath: string,
    allowWriteResolved: string[],
    denyWritePatterns: string[],
): void {
    const resolved = resolvePath(absolutePath);
    for (const pattern of denyWritePatterns) {
        if (matchesDenyWritePattern(resolved, pattern)) {
            throw createFsOpenError("EACCES", absolutePath);
        }
    }

    const allowed = allowWriteResolved.some((dir) => isUnderDir(resolved, dir));
    if (!allowed) {
        throw createFsOpenError("EACCES", absolutePath);
    }
}
// --- Operations factories ---

function createReadOps(denyReadResolved: string[]): ReadOperations {
    return {
        async readFile(absolutePath: string): Promise<Buffer> {
            assertReadAllowed(absolutePath, denyReadResolved);
            return fs.readFile(absolutePath);
        },
        async access(absolutePath: string): Promise<void> {
            assertReadAllowed(absolutePath, denyReadResolved);
            return fs.access(absolutePath);
        },
        async detectImageMimeType(
            absolutePath: string,
        ): Promise<string | null | undefined> {
            assertReadAllowed(absolutePath, denyReadResolved);
            try {
                const fh = await fs.open(absolutePath, "r");
                try {
                    const buf = Buffer.alloc(16);
                    await fh.read(buf, 0, 16, 0);
                    return detectImageMimeFromBytes(buf);
                } finally {
                    await fh.close();
                }
            } catch {
                return null;
            }
        },
    };
}

function createWriteOps(
    allowWriteResolved: string[],
    denyWritePatterns: string[],
): WriteOperations {
    return {
        async writeFile(absolutePath: string, content: string): Promise<void> {
            assertWriteAllowed(
                absolutePath,
                allowWriteResolved,
                denyWritePatterns,
            );
            await fs.writeFile(absolutePath, content, "utf-8");
        },
        async mkdir(dir: string): Promise<void> {
            assertWriteAllowed(dir, allowWriteResolved, denyWritePatterns);
            await fs.mkdir(dir, { recursive: true });
        },
    };
}

function createEditOps(
    readOps: ReadOperations,
    writeOps: WriteOperations,
): EditOperations {
    return {
        readFile: readOps.readFile,
        access: readOps.access,
        writeFile: writeOps.writeFile,
    };
}

function shellQuote(s: string): string {
    return "'" + s.replace(/'/g, "'\\''") + "'";
}

async function execSandboxed(
    command: string,
    cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    const wrapped = await SandboxManager.wrapWithSandbox(command);
    return new Promise((resolve, reject) => {
        const child = spawn("bash", ["-c", wrapped], {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (data: Buffer) => {
            stdout += data.toString();
        });
        child.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => {
            resolve({ stdout, stderr, exitCode: code });
        });
    });
}

async function pathExists(absolutePath: string): Promise<boolean> {
    try {
        await fs.access(absolutePath);
        return true;
    } catch {
        return false;
    }
}

function createGrepOps(denyReadResolved: string[]): GrepOperations {
    return {
        async isDirectory(absolutePath: string): Promise<boolean> {
            assertReadAllowed(absolutePath, denyReadResolved);
            const stat = await fs.stat(absolutePath);
            return stat.isDirectory();
        },
        async readFile(absolutePath: string): Promise<string> {
            assertReadAllowed(absolutePath, denyReadResolved);
            return fs.readFile(absolutePath, "utf-8");
        },
    };
}

function createFindOps(denyReadResolved: string[]): FindOperations {
    return {
        async exists(absolutePath: string): Promise<boolean> {
            assertReadAllowed(absolutePath, denyReadResolved);
            return pathExists(absolutePath);
        },
        async glob(
            pattern: string,
            cwd: string,
            options: { ignore: string[]; limit: number },
        ): Promise<string[]> {
            // Intentionally rely on the sandbox runtime for deny-read enforcement here
            // so fd emits its native denial behavior for glob searches.
            const args = [
                "fd",
                "--glob",
                "--color=never",
                "--hidden",
                "--max-results",
                String(options.limit),
            ];

            const gitignoreFiles = new Set<string>();
            const rootGitignore = join(cwd, ".gitignore");
            if (existsSync(rootGitignore)) {
                gitignoreFiles.add(rootGitignore);
            }

            try {
                const nestedGitignores = globSync("**/.gitignore", {
                    cwd,
                    dot: true,
                    absolute: true,
                    ignore: options.ignore,
                });
                for (const file of nestedGitignores) {
                    gitignoreFiles.add(file);
                }
            } catch {
                // Ignore glob errors
            }

            for (const gitignorePath of gitignoreFiles) {
                args.push("--ignore-file", shellQuote(gitignorePath));
            }

            args.push(shellQuote(pattern), shellQuote(cwd));

            const { stdout, stderr, exitCode } = await execSandboxed(
                args.join(" "),
            );
            if (exitCode !== 0) {
                const message = stderr.trim();
                throw new Error(
                    message
                        ? `find failed with exit code ${exitCode}: ${message}`
                        : `find failed with exit code ${exitCode}`,
                );
            }
            return stdout.trim()
                ? stdout.trim().split("\n").filter(Boolean)
                : [];
        },
    };
}

function createLsOps(denyReadResolved: string[]): LsOperations {
    return {
        async exists(absolutePath: string): Promise<boolean> {
            assertReadAllowed(absolutePath, denyReadResolved);
            return pathExists(absolutePath);
        },
        async stat(absolutePath: string) {
            assertReadAllowed(absolutePath, denyReadResolved);
            return fs.stat(absolutePath);
        },
        async readdir(absolutePath: string): Promise<string[]> {
            assertReadAllowed(absolutePath, denyReadResolved);
            return fs.readdir(absolutePath);
        },
    };
}

function createSandboxedBashOps(osConfig: OsSandboxConfig): BashOperations {
    const commandEnv = getSandboxCommandEnv(osConfig);

    return {
        async exec(command, cwd, { onData, signal, timeout }) {
            if (!existsSync(cwd)) {
                throw new Error(`Working directory does not exist: ${cwd}`);
            }

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

export function createOsSandbox(): SandboxProvider<OsSandboxConfig> {
    let initialized = false;
    let ops: SandboxOps = {};
    let savedConfig: OsSandboxConfig | null = null;

    return {
        async init(
            cwd: string,
            ui: ExtensionUIContext,
            config: OsSandboxConfig,
        ) {
            const platform = process.platform;
            if (platform !== "darwin" && platform !== "linux") {
                throw new Error(`Sandbox not supported on ${platform}`);
            }

            await SandboxManager.initialize({
                network: config.network,
                filesystem: config.filesystem,
                ignoreViolations: config.ignoreViolations,
                enableWeakerNestedSandbox: config.enableWeakerNestedSandbox,
            });

            // sandbox-runtime reads CLAUDE_TMPDIR in wrapWithSandbox() when it builds
            // proxy/TMPDIR env for sandboxed commands.
            const sandboxTmpDir = getSandboxCommandEnv(config).TMPDIR || "/tmp";
            process.env.CLAUDE_TMPDIR = sandboxTmpDir;

            // Resolve config paths to absolute paths
            const denyReadResolved = (config.filesystem?.denyRead ?? []).map(
                (p) => expandConfigPath(p, cwd),
            );
            const allowWriteResolved = (
                config.filesystem?.allowWrite ?? []
            ).map((p) => expandConfigPath(p, cwd));
            const denyWritePatterns = config.filesystem?.denyWrite ?? [];

            const readOps = createReadOps(denyReadResolved);
            const writeOps = createWriteOps(
                allowWriteResolved,
                denyWritePatterns,
            );

            ops = {
                bash: createSandboxedBashOps(config),
                read: readOps,
                write: writeOps,
                edit: createEditOps(readOps, writeOps),
                grep: createGrepOps(denyReadResolved),
                find: createFindOps(denyReadResolved),
                ls: createLsOps(denyReadResolved),
            };

            initialized = true;
            savedConfig = config;

            const networkCount = config.network?.allowedDomains?.length ?? 0;
            const writeCount = config.filesystem?.allowWrite?.length ?? 0;
            ui.setStatus(
                "sandbox",
                ui.theme.fg(
                    "accent",
                    `🛡️ OS sandbox: ${networkCount} domains, ${writeCount} write paths`,
                ),
            );
        },

        async shutdown() {
            if (initialized) {
                try {
                    await SandboxManager.reset();
                } catch {
                    // Ignore cleanup errors
                }
                ops = {};
                initialized = false;
            }
        },

        isActive() {
            return initialized;
        },

        getOps(): SandboxOps {
            if (!initialized) throw new Error("Sandbox not initialized");
            return ops;
        },

        describe() {
            const c = savedConfig;
            return [
                "Sandbox: os",
                "",
                "Network:",
                `  Allowed: ${c?.network?.allowedDomains?.join(", ") || "(none)"}`,
                `  Denied: ${c?.network?.deniedDomains?.join(", ") || "(none)"}`,
                "",
                "Filesystem:",
                `  Deny Read: ${c?.filesystem?.denyRead?.join(", ") || "(none)"}`,
                `  Allow Write: ${c?.filesystem?.allowWrite?.join(", ") || "(none)"}`,
                `  Deny Write: ${c?.filesystem?.denyWrite?.join(", ") || "(none)"}`,
            ];
        },
        patchSystemPrompt(systemPrompt: string) {
            return systemPrompt;
        },
    };
}
