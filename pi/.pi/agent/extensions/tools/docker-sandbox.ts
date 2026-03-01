/**
 * Docker sandbox provider — runs pi tools inside a pre-existing Docker container.
 *
 * All tool operations (bash, read, write, edit, grep, find, ls) are routed
 * through a single persistent `docker exec -i container bash` process,
 * eliminating the ~50-100ms startup overhead of spawning a new docker exec
 * per tool invocation. A sentinel protocol using null-byte-framed markers
 * demarcates command output boundaries in the shared stdout stream.
 *
 * Bind mounts are auto-detected from `docker inspect`. The longest-prefix
 * match translates host paths to container paths; unmatched paths pass
 * through as-is (supporting container-only paths like /tmp).
 *
 * Init validates that the current working directory and the skills directory
 * (~/.pi/agent/skills) are each covered by a bind mount, and fails with an
 * error in the status line if either is missing.
 *
 * Example ~/.pi/agent/sandbox.json:
 *   { "type": "docker", "container": "agent-sandbox" }
 *
 * Example docker run:
 *   docker run -d --name agent-sandbox \
 *     -v ~/workspace:/workspace \
 *     -v ~/.pi/agent/skills:/root/.pi/agent/skills:ro \
 *     node:22 sleep infinity
 *
 * The container image should have: bash, rg (ripgrep), fd, base64.
 */

import { spawn, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import type { ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import type {
    BashOperations,
    ReadOperations,
    WriteOperations,
    EditOperations,
    FindOperations,
    LsOperations,
} from "@mariozechner/pi-coding-agent";
import type {
    DockerSandboxConfig,
    SandboxProvider,
    SandboxOps,
} from "./sandbox-shared";
import {
    type StreamingExec,
    createSandboxedGrepExecute,
    sandboxedFdGlob,
} from "./sandbox-tools";
import { detectImageMimeFromBytes } from "./shared";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function shQuote(value: string): string {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}

/**
 * Translate a host-absolute path to its container equivalent using the
 * mount table. If no mount prefix matches, the path is returned as-is
 * (it may already be a container path like /tmp or /workspace/...).
 */
export function hostToGuestPath(
    hostPath: string,
    mounts: Record<string, string>,
): string {
    let bestHost = "";
    let bestContainer = "";

    for (const [hostMount, containerMount] of Object.entries(mounts)) {
        if (
            (hostPath === hostMount || hostPath.startsWith(hostMount + "/")) &&
            hostMount.length > bestHost.length
        ) {
            bestHost = hostMount;
            bestContainer = containerMount;
        }
    }

    if (!bestHost) return hostPath;
    if (hostPath === bestHost) return bestContainer;
    return bestContainer + hostPath.slice(bestHost.length);
}

function isPathCoveredByMounts(
    hostPath: string,
    mounts: Record<string, string>,
): boolean {
    return Object.keys(mounts).some(
        (hostMount) =>
            hostPath === hostMount || hostPath.startsWith(hostMount + "/"),
    );
}

function isContainerRunning(container: string): boolean {
    try {
        const out = execSync(
            `docker inspect -f '{{.State.Running}}' ${shQuote(container)}`,
            { stdio: ["ignore", "pipe", "ignore"], timeout: 5000 },
        );
        return out.toString().trim() === "true";
    } catch {
        return false;
    }
}

/**
 * Auto-detect bind mounts from `docker inspect`. Returns a map of
 * host-absolute source paths to container destination paths.
 */
function autoDetectMounts(container: string): Record<string, string> {
    try {
        const out = execSync(`docker inspect ${shQuote(container)}`, {
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 5000,
        });
        const info = JSON.parse(out.toString());
        const mountList: Array<{
            Type: string;
            Source: string;
            Destination: string;
        }> = info[0]?.Mounts ?? [];

        const result: Record<string, string> = {};
        for (const m of mountList) {
            if (m.Type === "bind") {
                result[m.Source] = m.Destination;
            }
        }
        return result;
    } catch {
        return {};
    }
}

// ---------------------------------------------------------------------------
// Persistent Shell
// ---------------------------------------------------------------------------

/** Byte prefix for sentinel markers: two null bytes + "PIEOF:" */
const SENTINEL_PREFIX = Buffer.from("\0\0PIEOF:");
/** Regex for a full sentinel line (without trailing newline). */
const SENTINEL_REGEX = /\0\0PIEOF:(\d+):([^\0]+)\0\0/;

export function findMatchingSentinel(
    pending: Buffer,
    uuid: string,
): { idx: number; exitCode: number } | null {
    let searchFrom = 0;
    while (true) {
        const idx = pending.indexOf(SENTINEL_PREFIX, searchFrom);
        if (idx === -1) return null;

        const nlIdx = pending.indexOf(0x0a, idx + SENTINEL_PREFIX.length);
        if (nlIdx === -1) return null;

        const sentinel = pending.subarray(idx, nlIdx).toString();
        const match = sentinel.match(SENTINEL_REGEX);
        if (match && match[2] === uuid) {
            return { idx, exitCode: parseInt(match[1], 10) };
        }

        // Non-matching sentinel-like output from the command itself.
        // Skip it and continue searching for this command's UUID marker.
        searchFrom = idx + SENTINEL_PREFIX.length;
    }
}

/**
 * Bytes to retain at the tail of the streaming buffer to avoid forwarding
 * a partial sentinel to the caller. Must be >= max sentinel length (~52 bytes).
 */
const TAIL_BUFFER_SIZE = 64;

/**
 * Keeps a single `docker exec -i <container> bash` process alive for the
 * entire session. Commands are serialized through a promise chain and
 * demarcated by null-byte-framed sentinel lines in stdout.
 */
class DockerPersistentShell {
    private child;
    private container: string;
    private bashPid = 0;
    private dead = false;
    private deadReason: string | null = null;
    private dataHandler: ((chunk: Buffer) => void) | null = null;
    private chain: Promise<void> = Promise.resolve();
    readonly stderrFile: string;

    constructor(container: string) {
        this.container = container;
        this.stderrFile = `/tmp/_pi_stderr_${randomUUID().replace(/-/g, "")}`;
        this.child = spawn("docker", ["exec", "-i", container, "bash"], {
            stdio: ["pipe", "pipe", "pipe"],
        });

        this.child.stdout!.on("data", (chunk: Buffer) => {
            this.dataHandler?.(chunk);
        });

        // Consume stderr to prevent pipe buffer blocking. Command stderr
        // is redirected per-command (2>&1 or 2>/tmp/file), so this pipe
        // only carries bash-level or docker-level errors.
        this.child.stderr!.on("data", () => {});

        this.child.on("error", (err) => {
            this.markDead(`spawn error: ${err.message}`);
        });

        this.child.on("close", (code, signal) => {
            this.markClosed(code, signal);
        });

        // Enable abort/timeout via USR1 → kill background process
        this.child.stdin!.write("trap 'kill \"$_bg\" 2>/dev/null' USR1\n");
    }

    /**
     * Capture bash's PID inside the container. Must be called once after
     * construction so that sendSignal() can deliver USR1 directly to bash
     * (docker exec doesn't forward arbitrary signals to the child process).
     */
    async init() {
        const r = await this.exec("echo $$");
        this.bashPid = parseInt(r.stdout.trim(), 10);
    }

    /**
     * Run a command synchronously (for read, write, edit, ls, find ops).
     * Stderr is merged into stdout via `( cmd ) 2>&1`.
     */
    exec(cmd: string): Promise<{ exitCode: number; stdout: string }> {
        if (this.dead) return Promise.reject(this.deadError());
        const p = this.chain.then(() => this.runSync(cmd));
        this.chain = p.then(
            () => {},
            () => {},
        );
        return p;
    }

    /**
     * Run a command with streaming output (for bash tool, grep).
     * The command is backgrounded to support abort via USR1.
     * Caller controls stderr redirection in the command string.
     */
    execStream(
        cmd: string,
        opts: {
            onData: (chunk: Buffer) => void;
            signal?: AbortSignal;
            timeout?: number;
        },
    ): Promise<{ exitCode: number }> {
        if (this.dead) return Promise.reject(this.deadError());
        if (opts.signal?.aborted) return Promise.reject(new Error("aborted"));
        const p = this.chain.then(() => this.runStream(cmd, opts));
        this.chain = p.then(
            () => {},
            () => {},
        );
        return p;
    }

    close() {
        this.markDead("closed by caller");
        try {
            this.child.stdin!.write("exit\n");
            this.child.kill();
        } catch {}
    }

    // -- internals --

    private markDead(reason: string) {
        this.dead = true;
        if (!this.deadReason) this.deadReason = reason;
    }

    private deadError(): Error {
        return this.deadReason
            ? new Error(`Shell is dead: ${this.deadReason}`)
            : new Error("Shell is dead");
    }

    private closeDetails(
        code: number | null,
        signal: NodeJS.Signals | null,
    ): string {
        return signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
    }

    private markClosed(code: number | null, signal: NodeJS.Signals | null) {
        this.markDead(`process closed (${this.closeDetails(code, signal)})`);
    }

    /**
     * Send USR1 to bash inside the container via a one-off docker exec.
     * This bypasses the docker exec stdin pipe (which bash won't read
     * while blocked in `wait`) and delivers the signal directly.
     */
    private sendSignal() {
        if (!this.bashPid) return;
        try {
            spawn(
                "docker",
                ["exec", this.container, "kill", "-USR1", String(this.bashPid)],
                { stdio: "ignore" },
            ).unref();
        } catch {}
    }

    private runSync(
        cmd: string,
    ): Promise<{ exitCode: number; stdout: string }> {
        return new Promise((resolve, reject) => {
            if (this.dead) {
                reject(this.deadError());
                return;
            }

            const uuid = randomUUID();
            let pending = Buffer.alloc(0);

            const onClose = (
                code: number | null,
                signal: NodeJS.Signals | null,
            ) => {
                this.markClosed(code, signal);
                this.dataHandler = null;
                reject(this.deadError());
            };
            this.child.once("close", onClose);

            this.dataHandler = (chunk: Buffer) => {
                pending = Buffer.concat([pending, chunk]);

                const marker = findMatchingSentinel(pending, uuid);
                if (!marker) return;

                this.child.removeListener("close", onClose);
                this.dataHandler = null;

                resolve({
                    exitCode: marker.exitCode,
                    stdout: pending.subarray(0, marker.idx).toString(),
                });
            };

            this.child.stdin!.write(
                `( ${cmd}\n) 2>&1\nprintf '\\0\\0PIEOF:%d:%s\\0\\0\\n' $? ${uuid}\n`,
            );
        });
    }

    private runStream(
        cmd: string,
        opts: {
            onData: (chunk: Buffer) => void;
            signal?: AbortSignal;
            timeout?: number;
        },
    ): Promise<{ exitCode: number }> {
        return new Promise((resolve, reject) => {
            if (this.dead) {
                reject(this.deadError());
                return;
            }

            const uuid = randomUUID();
            let pending = Buffer.alloc(0);
            let timedOut = false;

            const cleanup = () => {
                if (timer) clearTimeout(timer);
                if (onAbort) opts.signal?.removeEventListener("abort", onAbort);
                this.child.removeListener("close", onClose);
                this.dataHandler = null;
            };

            const onClose = (
                code: number | null,
                signal: NodeJS.Signals | null,
            ) => {
                this.markClosed(code, signal);
                cleanup();
                reject(this.deadError());
            };
            this.child.once("close", onClose);

            const onAbort = opts.signal ? () => this.sendSignal() : undefined;
            if (onAbort) {
                opts.signal!.addEventListener("abort", onAbort, { once: true });
            }

            let timer: NodeJS.Timeout | undefined;
            if (opts.timeout && opts.timeout > 0) {
                timer = setTimeout(() => {
                    timedOut = true;
                    this.sendSignal();
                }, opts.timeout * 1000);
            }

            this.dataHandler = (chunk: Buffer) => {
                pending = Buffer.concat([pending, chunk]);

                // Check for this command's sentinel (ignore non-matching lookalikes)
                const marker = findMatchingSentinel(pending, uuid);
                if (marker) {
                    cleanup();

                    // Forward any remaining output before the sentinel
                    const output = pending.subarray(0, marker.idx);
                    if (output.length > 0) opts.onData(output);

                    if (opts.signal?.aborted) reject(new Error("aborted"));
                    else if (timedOut)
                        reject(new Error(`timeout:${opts.timeout}`));
                    else resolve({ exitCode: marker.exitCode });
                    return;
                }

                // No sentinel yet — forward data, keeping a tail buffer
                // large enough to detect a sentinel that spans two chunks
                if (pending.length > TAIL_BUFFER_SIZE) {
                    opts.onData(
                        Buffer.from(
                            pending.subarray(
                                0,
                                pending.length - TAIL_BUFFER_SIZE,
                            ),
                        ),
                    );
                    pending = Buffer.from(
                        pending.subarray(pending.length - TAIL_BUFFER_SIZE),
                    );
                }
            };

            this.child.stdin!.write(
                `${cmd} & _bg=$!\nwait "$_bg" 2>/dev/null\n_rc=$?; _bg=\nprintf '\\0\\0PIEOF:%d:%s\\0\\0\\n' "$_rc" ${uuid}\n`,
            );
        });
    }
}

// ---------------------------------------------------------------------------
// StreamingExec adapter (for grep / find shared implementations)
// ---------------------------------------------------------------------------

/**
 * Bridge between DockerPersistentShell and the StreamingExec interface
 * used by sandbox-tools.ts. Stderr is captured to a fixed tmpfile
 * (one per shell instance) so that onStdout and onStderr can be called
 * separately. The file is overwritten each call; safe because commands
 * are serialized through the shell's promise chain.
 */
function createShellStreamingExec(shell: DockerPersistentShell): StreamingExec {
    const { stderrFile } = shell;

    return async (cmd, { signal, onStdout, onStderr }) => {
        const result = await shell.execStream(`${cmd} 2>${stderrFile}`, {
            onData: (chunk) => onStdout(chunk.toString()),
            signal,
        });

        const stderrResult = await shell.exec(`cat ${stderrFile} 2>/dev/null`);
        if (stderrResult.stdout) onStderr(stderrResult.stdout);

        return result;
    };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

function createDockerBashOps(
    shell: DockerPersistentShell,
    mounts: Record<string, string>,
): BashOperations {
    return {
        async exec(command, cwd, { onData, signal, timeout }) {
            const guestCwd = hostToGuestPath(cwd, mounts);
            const cmd = `cd ${shQuote(guestCwd)} && bash -c ${shQuote(command)} 2>&1`;
            return shell.execStream(cmd, { onData, signal, timeout });
        },
    };
}

function createDockerReadOps(
    shell: DockerPersistentShell,
    mounts: Record<string, string>,
): ReadOperations {
    return {
        async readFile(p) {
            const guestPath = hostToGuestPath(p, mounts);
            const r = await shell.exec(`base64 < ${shQuote(guestPath)}`);
            if (r.exitCode !== 0) {
                throw new Error(r.stdout.trim() || `Failed to read: ${p}`);
            }
            return Buffer.from(r.stdout, "base64");
        },

        async access(p) {
            const guestPath = hostToGuestPath(p, mounts);
            const r = await shell.exec(`test -r ${shQuote(guestPath)}`);
            if (r.exitCode !== 0) {
                throw new Error(`ENOENT: no such file or directory: ${p}`);
            }
        },

        async detectImageMimeType(p) {
            const guestPath = hostToGuestPath(p, mounts);
            const r = await shell.exec(
                `head -c 16 ${shQuote(guestPath)} | base64`,
            );
            if (r.exitCode !== 0) return null;
            const buf = Buffer.from(r.stdout.trim(), "base64");
            return detectImageMimeFromBytes(buf);
        },
    };
}

function createDockerWriteOps(
    shell: DockerPersistentShell,
    mounts: Record<string, string>,
): WriteOperations {
    return {
        async writeFile(p, content) {
            const guestPath = hostToGuestPath(p, mounts);
            const dir = path.posix.dirname(guestPath);
            const heredoc = `PIOB64_${randomUUID()}`;
            const buf = Buffer.isBuffer(content)
                ? content
                : Buffer.from(content);
            const b64 = buf.toString("base64").replace(/.{76}/g, "$&\n");
            const cmd = [
                `mkdir -p ${shQuote(dir)}`,
                `base64 -d > ${shQuote(guestPath)} <<'${heredoc}'`,
                b64,
                heredoc,
            ].join("\n");
            const r = await shell.exec(cmd);
            if (r.exitCode !== 0) {
                throw new Error(
                    `Failed to write: ${p}${r.stdout ? "\n" + r.stdout.trim() : ""}`,
                );
            }
        },

        async mkdir(dir) {
            const guestDir = hostToGuestPath(dir, mounts);
            const r = await shell.exec(`mkdir -p ${shQuote(guestDir)}`);
            if (r.exitCode !== 0) {
                throw new Error(
                    `Failed to mkdir: ${dir}${r.stdout ? "\n" + r.stdout.trim() : ""}`,
                );
            }
        },
    };
}

function createDockerEditOps(
    shell: DockerPersistentShell,
    mounts: Record<string, string>,
): EditOperations {
    const r = createDockerReadOps(shell, mounts);
    const w = createDockerWriteOps(shell, mounts);
    return { readFile: r.readFile, access: r.access, writeFile: w.writeFile };
}

function createDockerGrepExecute(
    shell: DockerPersistentShell,
    mounts: Record<string, string>,
): SandboxOps["grepExecute"] {
    return createSandboxedGrepExecute({
        resolveSearchPath: (userPath) =>
            hostToGuestPath(
                path.isAbsolute(userPath)
                    ? userPath
                    : path.resolve(process.cwd(), userPath),
                mounts,
            ),
        exec: createShellStreamingExec(shell),
    });
}

function createDockerFindOps(
    shell: DockerPersistentShell,
    mounts: Record<string, string>,
): FindOperations {
    const exec = createShellStreamingExec(shell);
    return {
        async exists(p) {
            const guestPath = hostToGuestPath(p, mounts);
            const r = await shell.exec(`test -e ${shQuote(guestPath)}`);
            return r.exitCode === 0;
        },

        async glob(pattern, cwd, options) {
            const guestCwd = hostToGuestPath(cwd, mounts);
            return sandboxedFdGlob({
                pattern,
                guestCwd,
                searchPath: cwd,
                limit: options.limit,
                exec,
            });
        },
    };
}

function createDockerLsOps(
    shell: DockerPersistentShell,
    mounts: Record<string, string>,
): LsOperations {
    return {
        async exists(p) {
            const guestPath = hostToGuestPath(p, mounts);
            const r = await shell.exec(`test -e ${shQuote(guestPath)}`);
            return r.exitCode === 0;
        },

        async stat(p) {
            const guestPath = hostToGuestPath(p, mounts);
            const r = await shell.exec(`stat -c '%F' ${shQuote(guestPath)}`);
            if (r.exitCode !== 0) {
                throw new Error(`Path not found: ${p}`);
            }
            const fileType = r.stdout.trim();
            return {
                isDirectory: () => fileType === "directory",
                isFile: () =>
                    fileType === "regular file" ||
                    fileType === "regular empty file",
                isSymbolicLink: () => fileType === "symbolic link",
            };
        },

        async readdir(p) {
            const guestPath = hostToGuestPath(p, mounts);
            const r = await shell.exec(`ls -1A ${shQuote(guestPath)}`);
            if (r.exitCode !== 0) {
                throw new Error(`Path not found: ${p}`);
            }
            return r.stdout.trim().split("\n").filter(Boolean).sort();
        },
    };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function createDockerSandbox(): SandboxProvider<DockerSandboxConfig> {
    let active = false;
    let ops: SandboxOps = {};
    let savedContainer = "";
    let savedMounts: Record<string, string> = {};
    let savedCwd = "";
    let savedContainerCwd = "";
    let savedHostSkillsDir = "";
    let savedGuestSkillsDir = "";
    let shell: DockerPersistentShell | null = null;

    return {
        async init(
            cwd: string,
            ui: ExtensionUIContext,
            config: DockerSandboxConfig,
        ) {
            const container = config.container ?? "agent-sandbox";

            if (!isContainerRunning(container)) {
                throw new Error(
                    `Docker container "${container}" is not running`,
                );
            }

            const mounts = autoDetectMounts(container);

            const containerCwd = hostToGuestPath(cwd, mounts);
            const cwdMapped = isPathCoveredByMounts(cwd, mounts);

            const hostSkillsDir = path.join(
                homedir(),
                ".pi",
                "agent",
                "skills",
            );
            const guestSkillsDir = hostToGuestPath(hostSkillsDir, mounts);
            const skillsMapped = isPathCoveredByMounts(hostSkillsDir, mounts);

            // Show errors for missing mounts
            const errors: string[] = [];
            if (!cwdMapped) {
                errors.push(`cwd "${cwd}" not mounted`);
            }
            if (!skillsMapped) {
                errors.push(`skills dir "${hostSkillsDir}" not mounted`);
            }

            if (errors.length > 0) {
                ui.setStatus(
                    "sandbox",
                    ui.theme.fg(
                        "error",
                        `🐳 Docker sandbox: ${container} — ${errors.join("; ")}`,
                    ),
                );
                throw new Error(
                    `Docker sandbox "${container}": ${errors.join("; ")}`,
                );
            }

            shell = new DockerPersistentShell(container);
            await shell.init();

            ops = {
                bash: createDockerBashOps(shell, mounts),
                read: createDockerReadOps(shell, mounts),
                write: createDockerWriteOps(shell, mounts),
                edit: createDockerEditOps(shell, mounts),
                grepExecute: createDockerGrepExecute(shell, mounts),
                find: createDockerFindOps(shell, mounts),
                ls: createDockerLsOps(shell, mounts),
            };

            active = true;
            savedContainer = container;
            savedMounts = mounts;
            savedCwd = cwd;
            savedContainerCwd = containerCwd;
            savedHostSkillsDir = hostSkillsDir;
            savedGuestSkillsDir = guestSkillsDir;

            const mountCount = Object.keys(mounts).length;
            ui.setStatus(
                "sandbox",
                ui.theme.fg(
                    "accent",
                    `🐳 Docker sandbox: ${container} (${containerCwd}, ${mountCount} mount${mountCount !== 1 ? "s" : ""})`,
                ),
            );
        },

        async shutdown() {
            active = false;
            ops = {};
            shell?.close();
            shell = null;
        },

        isActive() {
            return active;
        },

        getOps(): SandboxOps {
            return ops;
        },

        describe() {
            const mountEntries = Object.entries(savedMounts);
            return [
                "Sandbox: docker",
                `  Container: ${savedContainer}`,
                `  Mounts (${mountEntries.length}):`,
                ...mountEntries.map(([h, c]) => `    ${h} → ${c}`),
            ];
        },

        patchSystemPrompt(systemPrompt: string) {
            if (!active) return systemPrompt;
            let modified = systemPrompt.replace(
                `Current working directory: ${savedCwd}`,
                `Current working directory: ${savedContainerCwd} (docker: ${savedContainer})`,
            );
            modified = modified
                .split(savedHostSkillsDir)
                .join(savedGuestSkillsDir);
            return modified;
        },
    };
}
