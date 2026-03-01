/**
 * Shared tool implementations for sandbox providers (grep, find output parsing).
 *
 * Each provider supplies a thin execution layer; the parsing/formatting
 * logic lives here to avoid duplication between gondolin and docker.
 */

import path from "node:path";
import type { SandboxOps } from "./sandbox-shared";

function shQuote(value: string): string {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}

// ---------------------------------------------------------------------------
// Grep
// ---------------------------------------------------------------------------

/**
 * Callback that streams a shell command's stdout/stderr and returns
 * the exit code. Providers implement this with their own exec mechanism.
 */
export interface StreamingExec {
    (
        cmd: string,
        opts: {
            signal?: AbortSignal;
            onStdout: (data: string) => void;
            onStderr: (data: string) => void;
        },
    ): Promise<{ exitCode: number }>;
}

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

/**
 * Create a `grepExecute` implementation that runs `rg --json` via the
 * provided streaming exec callback.
 */
export function createSandboxedGrepExecute(opts: {
    resolveSearchPath: (userPath: string) => string;
    exec: StreamingExec;
}): SandboxOps["grepExecute"] {
    return async (params: any, signal?: AbortSignal) => {
        if (signal?.aborted) throw new Error("Operation aborted");

        const searchPath = opts.resolveSearchPath(params.path || ".");
        const effectiveLimit = Math.max(1, params.limit ?? DEFAULT_LIMIT);
        const contextValue =
            params.context && params.context > 0 ? params.context : 0;

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

        const outputLines: string[] = [];
        let matchCount = 0;
        let matchLimitReached = false;
        let linesTruncated = false;
        let killedDueToLimit = false;
        let stdoutRemainder = "";
        let stderr = "";

        const ac = new AbortController();
        const onAbort = () => ac.abort();
        signal?.addEventListener("abort", onAbort, { once: true });

        try {
            const result = await opts.exec(cmd, {
                signal: ac.signal,
                onStdout: (data) => {
                    if (killedDueToLimit) return;

                    const text = stdoutRemainder + data;
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
                                return;
                            }
                        }

                        if (
                            event.type === "match" ||
                            event.type === "context"
                        ) {
                            const filePath: string | undefined =
                                event.data?.path?.text;
                            const lineNumber: number | undefined =
                                event.data?.line_number;
                            const lineText: string = (
                                event.data?.lines?.text ?? ""
                            )
                                .replace(/\n$/, "")
                                .replace(/\r/g, "");

                            if (!filePath || typeof lineNumber !== "number")
                                continue;

                            const rel = path.posix.relative(
                                searchPath,
                                filePath,
                            );
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
                },
                onStderr: (data) => {
                    stderr += data;
                },
            });

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

        const details: Record<string, any> = {};
        let truncated = false;
        const totalBytes = Buffer.byteLength(output, "utf-8");
        if (totalBytes > MAX_BYTES) {
            const kept: string[] = [];
            let byteCount = 0;
            for (const line of output.split("\n")) {
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

// ---------------------------------------------------------------------------
// Find
// ---------------------------------------------------------------------------

/**
 * Run `fd` inside a sandbox via the provided streaming exec callback.
 * Builds the fd command, collects output, handles errors, and converts
 * guest paths into paths prefixed with `searchPath` so the find tool's
 * relativization (`p.slice(searchPath.length + 1)`) produces correct results.
 */
export async function sandboxedFdGlob(opts: {
    pattern: string;
    guestCwd: string;
    searchPath: string;
    limit: number;
    exec: StreamingExec;
}): Promise<string[]> {
    const args = [
        "fd",
        "--glob",
        "--color=never",
        "--hidden",
        "--max-results",
        String(opts.limit),
        shQuote(opts.pattern),
        shQuote(opts.guestCwd),
    ];

    let stdout = "";
    let stderr = "";
    const r = await opts.exec(args.join(" "), {
        onStdout: (data) => {
            stdout += data;
        },
        onStderr: (data) => {
            stderr += data;
        },
    });

    if (r.exitCode !== 0 && !stdout.trim()) {
        const msg = stderr.trim();
        if (msg) throw new Error(`find failed (${r.exitCode}): ${msg}`);
        return [];
    }

    if (!stdout.trim()) return [];
    // The find tool relativizes results via p.slice(searchPath.length + 1),
    // which assumes a "/" separator after searchPath. When searchPath is "/",
    // this strips 2 chars instead of 1. Work around by prepending an extra
    // "/" so the "//..." prefix gets correctly stripped to the relative path.
    const rootPrefix = opts.searchPath === "/" ? "/" : "";
    return stdout
        .trim()
        .split("\n")
        .map((line) => line.replace(/\r$/, ""))
        .filter(Boolean)
        .map((line) => {
            const normalized = line.replace(/\\/g, "/");
            if (normalized.startsWith(opts.guestCwd)) {
                const suffix = normalized.slice(opts.guestCwd.length);
                const relative = suffix.replace(/^\//, "");
                return (
                    rootPrefix +
                    path.join(
                        opts.searchPath,
                        ...relative.split("/").filter(Boolean),
                    )
                );
            }
            const relative = normalized.replace(/^\.\//, "");
            return (
                rootPrefix +
                path.join(
                    opts.searchPath,
                    ...relative.split("/").filter(Boolean),
                )
            );
        });
}
