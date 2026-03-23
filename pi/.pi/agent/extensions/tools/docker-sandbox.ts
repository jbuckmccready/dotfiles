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
 * The container image should have: bash, python3, rg (ripgrep), fd, base64.
 *
 * WSL2 + Docker Desktop note: if Docker Desktop starts before the WSL
 * distro, `docker inspect` may report mangled bind-mount source paths
 * (e.g. /run/desktop/mnt/host/wsl/docker-desktop-bind-mounts/Ubuntu/<hash>)
 * instead of the real WSL paths, breaking host→container path translation.
 * Starting the WSL distro first and then launching Docker Desktop avoids
 * this issue.
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

const PYTHON_STREAM_HELPER = String.raw`
import base64
import os
import selectors
import subprocess
import sys
import traceback


def emit_header(kind: str, value: int) -> None:
    sys.stdout.buffer.write(f"{kind} {value}\n".encode("ascii"))
    sys.stdout.buffer.flush()


def emit_frame(kind: str, data: bytes) -> None:
    emit_header(kind, len(data))
    if data:
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()


def main() -> int:
    cmd = base64.b64decode(os.environ["PI_STREAM_CMD_B64"]).decode("utf-8")
    merge_stderr = os.environ.get("PI_STREAM_MERGE_STDERR") == "1"
    child = subprocess.Popen(
        ["bash", "-lc", cmd],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT if merge_stderr else subprocess.PIPE,
    )
    sel = selectors.DefaultSelector()
    assert child.stdout is not None
    sel.register(child.stdout, selectors.EVENT_READ, "O")
    if child.stderr is not None:
        sel.register(child.stderr, selectors.EVENT_READ, "E")

    try:
        while sel.get_map():
            for key, _ in sel.select():
                chunk = os.read(key.fileobj.fileno(), 8192)
                if chunk:
                    emit_frame(key.data, chunk)
                else:
                    sel.unregister(key.fileobj)
                    key.fileobj.close()
    finally:
        sel.close()

    return child.wait()


try:
    raise SystemExit(main())
except SystemExit:
    raise
except BaseException:
    emit_frame("E", traceback.format_exc().encode())
    raise SystemExit(127)
`;

function buildPythonStreamingCommand(
    cmd: string,
    mergeStderr: boolean,
): string {
    const cmdB64 = Buffer.from(cmd).toString("base64");
    return [
        `PI_STREAM_CMD_B64=${shQuote(cmdB64)} PI_STREAM_MERGE_STDERR=${mergeStderr ? "1" : "0"} python3 -u - <<'__PI_STREAM__'`,
        PYTHON_STREAM_HELPER,
        "__PI_STREAM__",
        "_rc=$?",
        `printf 'X %d\n' "$_rc"`,
    ].join("\n");
}

export function parseStreamingFrameHeader(
    line: string,
):
    | { kind: "stdout" | "stderr"; length: number }
    | { kind: "exit"; exitCode: number } {
    const match = line.match(/^([OEX]) (\d+)$/);
    if (!match) {
        throw new Error(
            `Malformed streaming frame header: ${JSON.stringify(line)}`,
        );
    }

    const value = parseInt(match[2], 10);
    if (match[1] === "O") return { kind: "stdout", length: value };
    if (match[1] === "E") return { kind: "stderr", length: value };
    return { kind: "exit", exitCode: value };
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
                // Strip trailing slashes to normalise paths like /var/folders/.../T/
                const src = m.Source.replace(/\/+$/, "") || "/";
                result[src] = m.Destination;
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
type RefHandle = { ref?: () => void; unref?: () => void };

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
 * Keeps a single `docker exec -i <container> bash` process alive for the
 * entire session. Commands are serialized through a promise chain. Sync
 * commands use raw stdout + sentinel; streaming commands use a Python helper
 * that emits framed stdout/stderr chunks plus an exit frame on stdout.
 */
class DockerPersistentShell {
    private child!: ReturnType<typeof spawn>;
    private container: string;
    private closedByCaller = false;
    private dead = false;
    private deadReason: string | null = null;
    private restartPromise: Promise<void> | null = null;
    private stdoutHandler: ((chunk: Buffer) => void) | null = null;
    private chain: Promise<void> = Promise.resolve();

    constructor(container: string) {
        this.container = container;
        this.spawnChild();
    }

    /**
     * Run a command synchronously (for read, write, edit, ls, find ops).
     * Stderr is merged into stdout via `( cmd ) 2>&1`.
     */
    exec(cmd: string): Promise<{ exitCode: number; stdout: string }> {
        const p = this.chain.then(async () => {
            this.setChildReferenced(true);
            try {
                await this.ensureAlive();
                return await this.runSync(cmd);
            } finally {
                this.setChildReferenced(false);
            }
        });
        this.chain = p.then(
            () => {},
            () => {},
        );
        return p;
    }

    /**
     * Run a command with streaming output (for bash tool, grep).
     * A Python helper runs the command under `bash -lc`, emits framed
     * stdout/stderr chunks on stdout, and the shell appends an exit frame
     * after the helper finishes. On abort/timeout the current persistent
     * shell is discarded and a fresh shell is started for later commands.
     */
    execStream(
        cmd: string,
        opts: {
            onStdout: (chunk: Buffer) => void;
            onStderr?: (chunk: Buffer) => void;
            mergeStderr?: boolean;
            signal?: AbortSignal;
            timeout?: number;
        },
    ): Promise<{ exitCode: number }> {
        if (opts.signal?.aborted) return Promise.reject(new Error("aborted"));
        const p = this.chain.then(async () => {
            this.setChildReferenced(true);
            try {
                await this.ensureAlive();
                return await this.runStream(cmd, opts);
            } finally {
                this.setChildReferenced(false);
            }
        });
        this.chain = p.then(
            () => {},
            () => {},
        );
        return p;
    }

    close() {
        this.closedByCaller = true;
        this.markDead("closed by caller");
        this.stdoutHandler = null;
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

    private setHandleReferenced(
        handle: RefHandle | null | undefined,
        referenced: boolean,
    ) {
        try {
            if (referenced) handle?.ref?.();
            else handle?.unref?.();
        } catch {}
    }

    private setChildReferenced(referenced: boolean) {
        this.setHandleReferenced(this.child, referenced);
        const stdioHandles = [
            this.child.stdin,
            this.child.stdout,
            this.child.stderr,
        ] as Array<RefHandle | null | undefined>;
        for (const handle of stdioHandles) {
            this.setHandleReferenced(handle, referenced);
        }
    }

    private spawnChild() {
        const child = spawn("docker", ["exec", "-i", this.container, "bash"], {
            stdio: ["pipe", "pipe", "pipe"],
        });
        this.child = child;

        child.stdout!.on("data", (chunk: Buffer) => {
            if (this.child !== child) return;
            this.stdoutHandler?.(chunk);
        });

        // Outer docker/bash stderr is not part of the command protocol.
        // Streaming stdout/stderr both come from framed records on stdout.
        child.stderr!.on("data", () => {});

        child.on("error", (err) => {
            if (this.child !== child) return;
            this.markDead(`spawn error: ${err.message}`);
        });

        child.on("close", (code, signal) => {
            if (this.child !== child) return;
            this.markClosed(code, signal);
        });

        // Init to false to avoid preventing exit when idle
        this.setChildReferenced(false);
    }

    private waitForShellReady(child: ReturnType<typeof spawn>): Promise<void> {
        return new Promise((resolve, reject) => {
            const uuid = randomUUID();
            const marker = Buffer.from(`\0\0PIREADY:${uuid}\0\0\n`);
            let pending = Buffer.alloc(0);

            const cleanup = () => {
                child.stdout?.removeListener("data", onData);
                child.removeListener("close", onClose);
                child.removeListener("error", onError);
            };

            const onData = (chunk: Buffer) => {
                pending = Buffer.concat([pending, chunk]);
                if (pending.indexOf(marker) === -1) return;
                cleanup();
                resolve();
            };

            const onClose = (
                code: number | null,
                signal: NodeJS.Signals | null,
            ) => {
                cleanup();
                reject(
                    new Error(
                        `shell failed to start (${this.closeDetails(code, signal)})`,
                    ),
                );
            };

            const onError = (err: Error) => {
                cleanup();
                reject(err);
            };

            child.stdout?.on("data", onData);
            child.once("close", onClose);
            child.once("error", onError);
            child.stdin!.write(`printf '\\0\\0PIREADY:%s\\0\\0\\n' ${uuid}\n`);
        });
    }

    private async ensureAlive() {
        if (this.closedByCaller) throw this.deadError();
        if (this.restartPromise) await this.restartPromise;
        if (!this.dead) return;
        await this.restartShell(this.deadReason ?? "shell is dead");
    }

    private restartShell(reason: string): Promise<void> {
        if (this.closedByCaller) return Promise.reject(this.deadError());
        if (this.restartPromise) return this.restartPromise;

        const previousChild = this.child;
        this.restartPromise = Promise.resolve()
            .then(async () => {
                this.stdoutHandler = null;
                try {
                    previousChild.stdin!.write("exit\n");
                } catch {}
                try {
                    previousChild.kill();
                } catch {}
                this.spawnChild();
                await this.waitForShellReady(this.child);
                this.dead = false;
                this.deadReason = null;
            })
            .catch((err) => {
                const message =
                    err instanceof Error ? err.message : String(err);
                this.markDead(
                    `failed to restart shell after ${reason}: ${message}`,
                );
                throw this.deadError();
            })
            .finally(() => {
                this.restartPromise = null;
            });

        return this.restartPromise;
    }

    private markClosed(code: number | null, signal: NodeJS.Signals | null) {
        this.markDead(`process closed (${this.closeDetails(code, signal)})`);
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
                this.stdoutHandler = null;
                reject(this.deadError());
            };
            this.child.once("close", onClose);

            this.stdoutHandler = (chunk: Buffer) => {
                pending = Buffer.concat([pending, chunk]);

                const marker = findMatchingSentinel(pending, uuid);
                if (!marker) return;

                this.child.removeListener("close", onClose);
                this.stdoutHandler = null;

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
            onStdout: (chunk: Buffer) => void;
            onStderr?: (chunk: Buffer) => void;
            mergeStderr?: boolean;
            signal?: AbortSignal;
            timeout?: number;
        },
    ): Promise<{ exitCode: number }> {
        return new Promise((resolve, reject) => {
            if (this.dead) {
                reject(this.deadError());
                return;
            }

            let pending = Buffer.alloc(0);

            const cleanup = () => {
                if (timer) clearTimeout(timer);
                if (onAbort) opts.signal?.removeEventListener("abort", onAbort);
                this.child.removeListener("close", onClose);
                this.stdoutHandler = null;
            };

            const discardShell = (reason: string, error: Error) => {
                this.markDead(reason);
                cleanup();
                void this.restartShell(reason);
                try {
                    this.child.kill();
                } catch {}
                reject(error);
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

            const onAbort = opts.signal
                ? () =>
                      discardShell(
                          "streaming command aborted",
                          new Error("aborted"),
                      )
                : undefined;
            if (onAbort) {
                opts.signal!.addEventListener("abort", onAbort, { once: true });
            }

            let timer: NodeJS.Timeout | undefined;
            if (opts.timeout && opts.timeout > 0) {
                timer = setTimeout(() => {
                    discardShell(
                        `streaming command timed out after ${opts.timeout}s`,
                        new Error(`timeout:${opts.timeout}`),
                    );
                }, opts.timeout * 1000);
            }

            this.stdoutHandler = (chunk: Buffer) => {
                pending = Buffer.concat([pending, chunk]);

                while (true) {
                    const nlIdx = pending.indexOf(0x0a);
                    if (nlIdx === -1) return;

                    const headerLine = pending.subarray(0, nlIdx).toString();
                    let header;
                    try {
                        header = parseStreamingFrameHeader(headerLine);
                    } catch (err) {
                        cleanup();
                        reject(
                            err instanceof Error ? err : new Error(String(err)),
                        );
                        return;
                    }

                    if (header.kind === "exit") {
                        pending = Buffer.from(pending.subarray(nlIdx + 1));
                        if (pending.length > 0) {
                            cleanup();
                            reject(
                                new Error(
                                    "Unexpected trailing bytes after streaming exit frame",
                                ),
                            );
                            return;
                        }
                        cleanup();
                        resolve({ exitCode: header.exitCode });
                        return;
                    }

                    const frameEnd = nlIdx + 1 + header.length;
                    if (pending.length < frameEnd) return;

                    const payload = Buffer.from(
                        pending.subarray(nlIdx + 1, frameEnd),
                    );
                    pending = Buffer.from(pending.subarray(frameEnd));

                    if (payload.length === 0) continue;
                    if (header.kind === "stdout") opts.onStdout(payload);
                    else (opts.onStderr ?? opts.onStdout)(payload);
                }
            };

            const wrappedCmd = buildPythonStreamingCommand(
                cmd,
                opts.mergeStderr ?? false,
            );
            this.child.stdin!.write(`${wrappedCmd}\n`);
        });
    }
}

// ---------------------------------------------------------------------------
// StreamingExec adapter (for grep / find shared implementations)
// ---------------------------------------------------------------------------

/**
 * Bridge between DockerPersistentShell and the StreamingExec interface
 * used by sandbox-tools.ts. The Python helper emits framed stdout/stderr
 * chunks, so the adapter can stream both channels directly.
 */
function createShellStreamingExec(shell: DockerPersistentShell): StreamingExec {
    return async (cmd, { signal, onStdout, onStderr }) => {
        return shell.execStream(cmd, {
            onStdout: (chunk) => onStdout(chunk.toString()),
            onStderr: (chunk) => onStderr(chunk.toString()),
            signal,
        });
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
            const cmd = `cd ${shQuote(guestCwd)} && bash -c ${shQuote(command)}`;
            return shell.execStream(cmd, {
                onStdout: onData,
                onStderr: onData,
                mergeStderr: false,
                signal,
                timeout,
            });
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
                throw new Error(
                    r.stdout.trim() || `Failed to read: ${guestPath}`,
                );
            }
            return Buffer.from(r.stdout, "base64");
        },

        async access(p) {
            const guestPath = hostToGuestPath(p, mounts);
            const r = await shell.exec(`test -r ${shQuote(guestPath)}`);
            if (r.exitCode !== 0) {
                throw new Error(
                    `ENOENT: no such file or directory: ${guestPath}`,
                );
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
                    `Failed to write: ${guestPath}${r.stdout ? "\n" + r.stdout.trim() : ""}`,
                );
            }
        },

        async mkdir(dir) {
            const guestDir = hostToGuestPath(dir, mounts);
            const r = await shell.exec(`mkdir -p ${shQuote(guestDir)}`);
            if (r.exitCode !== 0) {
                throw new Error(
                    `Failed to mkdir: ${guestDir}${r.stdout ? "\n" + r.stdout.trim() : ""}`,
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
                throw new Error(`Path not found: ${guestPath}`);
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
                throw new Error(`Path not found: ${guestPath}`);
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

        translatePath(hostPath: string) {
            return hostToGuestPath(hostPath, savedMounts);
        },
    };
}
