/**
 * Gondolin sandbox provider — runs pi tools inside a Gondolin micro-VM.
 * https://github.com/earendil-works/gondolin
 * Only works on MacOS and linux hosts where QEMU is available.
 *
 * The host working directory is mounted read-write at /workspace inside the VM.
 * Network access, secrets, and file visibility are controlled via sandbox.json.
 *
 * Example ~/.pi/agent/sandbox.json:
 *
 *   {
 *     "type": "gondolin",
 *     "guestDir": "~/dotfiles/gondolin/rust-assets",
 *     "allowedHosts": [
 *       "github.com",
 *       "*.github.com",
 *       "crates.io",
 *       "*.crates.io"
 *     ],
 *     "secrets": {
 *       "GH_TOKEN": {
 *         "hosts": ["api.github.com", "github.com"],
 *         "fromEnv": "GH_TOKEN_READONLY"
 *       }
 *     },
 *     "excludePaths": [".env", ".envrc"]
 *   }
 *
 * Config fields:
 *   guestDir      — path to custom guest image assets (built via `gondolin build`)
 *   allowedHosts  — HTTP egress allowlist, passed to gondolin's createHttpHooks.
 *                   Omit or set to [] to block all network. Use ["*"] for open network.
 *   secrets       — keys map to env var names, read from host env at init time.
 *                   Use "fromEnv" to read from a different host env var than the key name.
 *                   Real values never enter the VM — gondolin injects placeholders
 *                   and substitutes on outbound HTTP requests to allowed hosts.
 *   excludePaths  — workspace-relative paths hidden from the guest via ShadowProvider
 */
import { constants, existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { globSync } from "glob";
import type {
    ExtensionAPI,
    ExtensionUIContext,
} from "@mariozechner/pi-coding-agent";
import type {
    BashOperations,
    ReadOperations,
    WriteOperations,
    EditOperations,
    FindOperations,
    LsOperations,
} from "@mariozechner/pi-coding-agent";
import {
    VM,
    RealFSProvider,
    ReadonlyProvider,
    ShadowProvider,
    createShadowPathPredicate,
    createHttpHooks,
} from "@earendil-works/gondolin";
import type {
    GondolinSandboxConfig,
    SandboxProvider,
    SandboxOps,
} from "./sandbox-shared";

const GUEST_WORKSPACE = "/workspace";
const GUEST_HOME = "/root";
const GUEST_SKILLS_DIR = `${GUEST_HOME}/.pi/agent/skills`;
const HOST_HOME = homedir();

function shQuote(value: string): string {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function toGuestPath(localCwd: string, localPath: string): string {
    if (localPath === "~") return GUEST_HOME;
    if (localPath.startsWith("~/")) {
        return path.posix.join(GUEST_HOME, localPath.slice(2));
    }

    if (!path.isAbsolute(localPath)) {
        const posixRel = localPath.split(path.sep).join(path.posix.sep);
        if (posixRel === "" || posixRel === ".") return GUEST_WORKSPACE;
        if (!posixRel.startsWith("..")) {
            // Relative path inside the workspace
            return path.posix.join(GUEST_WORKSPACE, posixRel);
        }
        // Relative path escaping workspace — resolve relative to /workspace
        return path.posix.resolve(GUEST_WORKSPACE, posixRel);
    }

    const rel = path.relative(localCwd, localPath);
    if (rel === "") return GUEST_WORKSPACE;

    const posixRel = rel.split(path.sep).join(path.posix.sep);
    if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
        // Absolute path inside the workspace
        return path.posix.join(GUEST_WORKSPACE, posixRel);
    }

    // Absolute path under host home should map to guest home.
    if (localPath === HOST_HOME) return GUEST_HOME;
    const hostHomePrefix = HOST_HOME + path.sep;
    if (localPath.startsWith(hostHomePrefix)) {
        const homeRel = localPath.slice(hostHomePrefix.length);
        return path.posix.join(GUEST_HOME, ...homeRel.split(path.sep));
    }

    // Absolute path outside workspace — pass through as-is
    return localPath;
}

function createGondolinReadOps(vm: VM, localCwd: string): ReadOperations {
    return {
        async readFile(p) {
            const guestPath = toGuestPath(localCwd, p);
            return vm.fs.readFile(guestPath);
        },
        async access(p) {
            const guestPath = toGuestPath(localCwd, p);
            await vm.fs.access(guestPath, { mode: constants.R_OK });
        },
        async detectImageMimeType(p) {
            const guestPath = toGuestPath(localCwd, p);
            try {
                const r = await vm.exec([
                    "/bin/sh",
                    "-lc",
                    `file --mime-type -b ${shQuote(guestPath)}`,
                ]);
                if (!r.ok) return null;
                const m = r.stdout.trim();
                return [
                    "image/jpeg",
                    "image/png",
                    "image/gif",
                    "image/webp",
                ].includes(m)
                    ? m
                    : null;
            } catch {
                return null;
            }
        },
    };
}

function createGondolinWriteOps(vm: VM, localCwd: string): WriteOperations {
    return {
        async writeFile(p, content) {
            const guestPath = toGuestPath(localCwd, p);
            const dir = path.posix.dirname(guestPath);
            await vm.fs.mkdir(dir, { recursive: true });
            await vm.fs.writeFile(guestPath, content);
        },
        async mkdir(dir) {
            const guestDir = toGuestPath(localCwd, dir);
            await vm.fs.mkdir(guestDir, { recursive: true });
        },
    };
}

function createGondolinEditOps(vm: VM, localCwd: string): EditOperations {
    const r = createGondolinReadOps(vm, localCwd);
    const w = createGondolinWriteOps(vm, localCwd);
    return { readFile: r.readFile, access: r.access, writeFile: w.writeFile };
}

function createGondolinBashOps(vm: VM, localCwd: string): BashOperations {
    return {
        async exec(command, cwd, { onData, signal, timeout }) {
            const guestCwd = toGuestPath(localCwd, cwd);
            const ac = new AbortController();
            const onAbort = () => ac.abort();
            signal?.addEventListener("abort", onAbort, { once: true });

            let timedOut = false;
            const timer =
                timeout && timeout > 0
                    ? setTimeout(() => {
                          timedOut = true;
                          ac.abort();
                      }, timeout * 1000)
                    : undefined;

            try {
                const proc = vm.exec(["/bin/bash", "-lc", command], {
                    cwd: guestCwd,
                    signal: ac.signal,
                    // Don't pass env from host; the VM has its own environment.
                    // Avoids confusing agent and leaking secrets from host.
                    env: undefined,
                    stdout: "pipe",
                    stderr: "pipe",
                });
                for await (const chunk of proc.output()) {
                    onData(chunk.data);
                }
                const r = await proc;
                return { exitCode: r.exitCode };
            } catch (err) {
                if (signal?.aborted) throw new Error("aborted");
                if (timedOut) throw new Error(`timeout:${timeout}`);
                throw err;
            } finally {
                if (timer) clearTimeout(timer);
                signal?.removeEventListener("abort", onAbort);
            }
        },
    };
}

function createGondolinGrepExecute(vm: VM): SandboxOps["grepExecute"] {
    const MAX_LINE_LENGTH = 500;
    const MAX_BYTES = 50 * 1024;
    const DEFAULT_LIMIT = 100;

    function truncateLine(line: string): {
        text: string;
        wasTruncated: boolean;
    } {
        if (line.length <= MAX_LINE_LENGTH)
            return { text: line, wasTruncated: false };
        return {
            text: line.slice(0, MAX_LINE_LENGTH) + "... [truncated]",
            wasTruncated: true,
        };
    }

    return async (params: any, signal?: AbortSignal) => {
        if (signal?.aborted) throw new Error("Operation aborted");

        const userPath = params.path || ".";
        const searchPath = path.posix.isAbsolute(userPath)
            ? userPath
            : path.posix.join(GUEST_WORKSPACE, userPath);
        const effectiveLimit = Math.max(1, params.limit ?? DEFAULT_LIMIT);
        const contextValue =
            params.context && params.context > 0 ? params.context : 0;

        // Build rg args
        const args: string[] = [
            "--json",
            "--line-number",
            "--color=never",
            "--hidden",
        ];
        if (params.ignoreCase) args.push("--ignore-case");
        if (params.literal) args.push("--fixed-strings");
        if (params.glob) args.push("--glob", params.glob);
        if (contextValue > 0) args.push("-C", String(contextValue));
        args.push(params.pattern, searchPath);

        const cmd = ["rg", ...args.map((a) => shQuote(a))].join(" ");

        // Stream rg output line-by-line so we can abort once the match limit
        // is reached instead of buffering the entire result.
        const ac = new AbortController();
        const onAbort = () => ac.abort();
        signal?.addEventListener("abort", onAbort, { once: true });

        const outputLines: string[] = [];
        let matchCount = 0;
        let matchLimitReached = false;
        let linesTruncated = false;
        let stderr = "";
        let killedDueToLimit = false;
        let stdoutRemainder = "";

        try {
            const proc = vm.exec(["/bin/sh", "-lc", cmd], {
                signal: ac.signal,
                stdout: "pipe",
                stderr: "pipe",
            });

            for await (const chunk of proc.output()) {
                if (chunk.stream === "stderr") {
                    stderr += chunk.text;
                    continue;
                }

                // Buffer partial lines across chunks
                const text = stdoutRemainder + chunk.text;
                const lines = text.split("\n");
                stdoutRemainder = lines.pop() ?? "";
                for (const line of lines) {
                    if (!line.trim()) continue;

                    let event: any;
                    try {
                        event = JSON.parse(line);
                    } catch {
                        continue;
                    }

                    if (event.type === "match") {
                        matchCount++;
                        if (matchCount > effectiveLimit) {
                            matchLimitReached = true;
                            killedDueToLimit = true;
                            ac.abort();
                            break;
                        }
                    }

                    if (event.type === "match" || event.type === "context") {
                        const filePath: string | undefined =
                            event.data?.path?.text;
                        const lineNumber: number | undefined =
                            event.data?.line_number;
                        const lineText: string = (event.data?.lines?.text ?? "")
                            .replace(/\n$/, "")
                            .replace(/\r/g, "");

                        if (!filePath || typeof lineNumber !== "number")
                            continue;

                        const rel = path.posix.relative(searchPath, filePath);
                        const displayPath =
                            rel && !rel.startsWith("..")
                                ? rel
                                : path.posix.basename(filePath);

                        const { text: truncatedText, wasTruncated } =
                            truncateLine(lineText);
                        if (wasTruncated) linesTruncated = true;

                        const sep = event.type === "match" ? ":" : "-";
                        outputLines.push(
                            `${displayPath}${sep}${lineNumber}${sep} ${truncatedText}`,
                        );
                    }
                }
                if (killedDueToLimit) break;
            }

            const result = await proc;
            // rg exit code: 0 = matches, 1 = no matches, other = error
            if (
                !killedDueToLimit &&
                result.exitCode !== 0 &&
                result.exitCode !== 1
            ) {
                throw new Error(
                    stderr.trim() ||
                        `ripgrep exited with code ${result.exitCode}`,
                );
            }
        } catch (err) {
            if (signal?.aborted) throw new Error("Operation aborted");
            if (!killedDueToLimit) throw err;
        } finally {
            signal?.removeEventListener("abort", onAbort);
        }

        if (matchCount === 0) {
            return {
                content: [{ type: "text" as const, text: "No matches found" }],
                details: undefined,
            };
        }

        let output = outputLines.join("\n");

        // Byte truncation — accumulate complete lines up to limit
        const details: Record<string, any> = {};
        let truncated = false;
        const totalBytes = Buffer.byteLength(output, "utf-8");
        if (totalBytes > MAX_BYTES) {
            const lines = output.split("\n");
            const kept: string[] = [];
            let byteCount = 0;
            for (const line of lines) {
                const lineBytes =
                    Buffer.byteLength(line, "utf-8") +
                    (kept.length > 0 ? 1 : 0);
                if (byteCount + lineBytes > MAX_BYTES) break;
                kept.push(line);
                byteCount += lineBytes;
            }
            output = kept.join("\n");
            truncated = true;
            details.truncation = {
                truncated: true,
                originalSize: totalBytes,
            };
        }

        // Build notices
        const notices: string[] = [];
        if (matchLimitReached) {
            notices.push(
                `${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`,
            );
            details.matchLimitReached = effectiveLimit;
        }
        if (truncated) {
            notices.push("50KB limit reached");
        }
        if (linesTruncated) {
            notices.push(
                `Some lines truncated to ${MAX_LINE_LENGTH} chars. Use read tool to see full lines`,
            );
            details.linesTruncated = true;
        }
        if (notices.length > 0) {
            output += `\n\n[${notices.join(". ")}]`;
        }

        return {
            content: [{ type: "text" as const, text: output }],
            details: Object.keys(details).length > 0 ? details : undefined,
        };
    };
}

function createGondolinFindOps(vm: VM, localCwd: string): FindOperations {
    return {
        async exists(p) {
            const guestPath = toGuestPath(localCwd, p);
            try {
                await vm.fs.access(guestPath);
                return true;
            } catch {
                return false;
            }
        },
        async glob(pattern, cwd, options) {
            const guestCwd = toGuestPath(localCwd, cwd);
            const args = [
                "fd",
                "--glob",
                "--color=never",
                "--hidden",
                "--max-results",
                String(options.limit),
            ];

            const gitignoreFiles = new Set<string>();
            const rootGitignore = path.join(cwd, ".gitignore");
            if (existsSync(rootGitignore)) {
                gitignoreFiles.add(toGuestPath(localCwd, rootGitignore));
            }

            try {
                const nestedGitignores = globSync("**/.gitignore", {
                    cwd,
                    dot: true,
                    absolute: true,
                    ignore: options.ignore,
                });
                for (const file of nestedGitignores) {
                    gitignoreFiles.add(toGuestPath(localCwd, file));
                }
            } catch {
                // Ignore glob errors
            }

            for (const gitignorePath of gitignoreFiles) {
                args.push("--ignore-file", shQuote(gitignorePath));
            }

            args.push(shQuote(pattern), shQuote(guestCwd));

            const r = await vm.exec(["/bin/sh", "-lc", args.join(" ")]);
            if (!r.ok) {
                const msg = r.stderr.trim();
                throw new Error(
                    msg
                        ? `find failed (${r.exitCode}): ${msg}`
                        : `find failed (${r.exitCode})`,
                );
            }

            if (!r.stdout.trim()) return [];
            return r.stdout
                .trim()
                .split("\n")
                .map((line) => line.replace(/\r$/, ""))
                .filter(Boolean)
                .map((line) => {
                    const normalized = line.replace(/\\/g, "/");
                    if (normalized.startsWith(guestCwd)) {
                        const suffix = normalized.slice(guestCwd.length);
                        const relative = suffix.replace(/^\//, "");
                        return path.join(
                            cwd,
                            ...relative.split("/").filter(Boolean),
                        );
                    }
                    const relative = normalized.replace(/^\.\//, "");
                    return path.join(
                        cwd,
                        ...relative.split("/").filter(Boolean),
                    );
                });
        },
    };
}

function createGondolinLsOps(vm: VM, localCwd: string): LsOperations {
    return {
        async exists(p) {
            const guestPath = toGuestPath(localCwd, p);
            try {
                await vm.fs.access(guestPath);
                return true;
            } catch {
                return false;
            }
        },
        async stat(p) {
            const guestPath = toGuestPath(localCwd, p);
            try {
                return await vm.fs.stat(guestPath);
            } catch (err) {
                const message =
                    err instanceof Error ? err.message.toLowerCase() : "";
                if (message.includes("enoent") || message.includes("no such")) {
                    throw new Error(`Path not found: ${p}`);
                }
                throw err;
            }
        },
        async readdir(p) {
            const guestPath = toGuestPath(localCwd, p);
            const entries = await vm.fs.listDir(guestPath);
            return entries.sort();
        },
    };
}

export function createGondolinSandbox(): SandboxProvider<GondolinSandboxConfig> {
    let vm: VM | null = null;
    let localCwd = "";
    let ops: SandboxOps = {};
    let pi: ExtensionAPI | null = null;
    let ui: ExtensionUIContext | null = null;

    return {
        async init(
            extensionApi: ExtensionAPI,
            cwd: string,
            uiCtx,
            config: GondolinSandboxConfig,
        ) {
            pi = extensionApi;
            ui = uiCtx;
            localCwd = cwd;

            const hostSkillsDir = path.join(
                homedir(),
                ".pi",
                "agent",
                "skills",
            );
            const realSkillsDir = realpathSync(hostSkillsDir);

            let guestDir = config.guestDir;
            if (guestDir?.startsWith("~/")) {
                guestDir = path.join(homedir(), guestDir.slice(2));
            }

            const excludePaths = config.excludePaths ?? [];
            const workspaceProvider =
                excludePaths.length > 0
                    ? new ShadowProvider(new RealFSProvider(localCwd), {
                          shouldShadow: createShadowPathPredicate(
                              excludePaths.map((p) => "/" + p),
                          ),
                      })
                    : new RealFSProvider(localCwd);

            const allowedHosts = config.allowedHosts;
            const networkEnabled =
                allowedHosts !== undefined && allowedHosts.length > 0;

            const secrets: Record<string, { hosts: string[]; value: string }> =
                {};
            if (networkEnabled) {
                for (const [name, def] of Object.entries(
                    config.secrets ?? {},
                )) {
                    const value = process.env[def.fromEnv ?? name];
                    if (!value) continue;
                    secrets[name] = { hosts: def.hosts, value };
                }
            }

            const { httpHooks, env } = networkEnabled
                ? createHttpHooks({ allowedHosts, secrets })
                : createHttpHooks({
                      isRequestAllowed: async () => false,
                      isIpAllowed: async () => false,
                  });

            const vmPromise = VM.create({
                ...(guestDir ? { sandbox: { imagePath: guestDir } } : {}),
                httpHooks,
                env: { HOME: GUEST_HOME, ...env },
                vfs: {
                    mounts: {
                        [GUEST_WORKSPACE]: workspaceProvider,
                        [GUEST_SKILLS_DIR]: new ReadonlyProvider(
                            new RealFSProvider(realSkillsDir),
                        ),
                    },
                },
            });

            ui.setStatus(
                "sandbox",
                ui.theme.fg(
                    "accent",
                    `🏰 Gondolin sandbox: starting (${localCwd} → ${GUEST_WORKSPACE})`,
                ),
            );

            vm = await vmPromise;

            const excludeCount = excludePaths.length;
            const totalSecretCount = Object.keys(config.secrets ?? {}).length;
            const loadedSecretCount = Object.keys(secrets).length;
            const networkLabel = !networkEnabled
                ? "no network"
                : allowedHosts!.includes("*")
                  ? "open network"
                  : `${allowedHosts!.length} hosts`;
            const parts = [
                `🏰 Gondolin sandbox: ${networkLabel}`,
                `${excludeCount} excluded path${excludeCount !== 1 ? "s" : ""}`,
                `${loadedSecretCount}/${totalSecretCount} secrets loaded`,
            ];
            ui.setStatus("sandbox", ui.theme.fg("accent", parts.join(", ")));

            ops = {
                bash: createGondolinBashOps(vm, localCwd),
                read: createGondolinReadOps(vm, localCwd),
                write: createGondolinWriteOps(vm, localCwd),
                edit: createGondolinEditOps(vm, localCwd),
                // NOTE: override grepExecute so it uses rg inside the VM sandbox
                grepExecute: createGondolinGrepExecute(vm),
                find: createGondolinFindOps(vm, localCwd),
                ls: createGondolinLsOps(vm, localCwd),
            };

            // Patch system prompt to show /workspace as CWD and guest skill mount paths.
            pi.on("before_agent_start", async (event) => {
                let modified = event.systemPrompt.replace(
                    `Current working directory: ${localCwd}`,
                    `Current working directory: ${GUEST_WORKSPACE} (Gondolin VM, mounted from host: ${localCwd})`,
                );
                modified = modified.split(hostSkillsDir).join(GUEST_SKILLS_DIR);
                return { systemPrompt: modified };
            });
        },

        async shutdown() {
            if (vm) {
                ui?.setStatus(
                    "sandbox",
                    ui.theme.fg("muted", "Gondolin sandbox: stopping"),
                );
                try {
                    await vm.close();
                } catch {}
                vm = null;
                ops = {};
            }
        },

        isActive() {
            return vm !== null;
        },

        getOps(): SandboxOps {
            if (!vm) throw new Error("Gondolin sandbox not initialized");
            return ops;
        },
    };
}
