#!/usr/bin/env bun

import {
    spawnSync,
    type SpawnSyncOptionsWithStringEncoding,
} from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

interface ParsedArgs {
    input: string;
    outPath: string | null;
    writeTmp: boolean;
    doSummary: boolean;
    summaryPrompt: string | null;
}

interface SummaryOptions {
    mdPathForNote?: string | null;
    extraPrompt?: string | null;
}

function usage(scriptName: string): void {
    console.error(
        `Usage: ${scriptName} <url-or-path> [--out <file>] [--tmp] [--summary [prompt]] [--prompt <prompt>]`,
    );
}

function fail(message: string, exitCode = 1): never {
    console.error(message);
    process.exit(exitCode);
}

function isFlag(value: string | null | undefined): boolean {
    return typeof value === "string" && value.startsWith("--");
}

function isUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
}

function safeName(value: string | undefined): string {
    return (value || "document").replace(/[^a-z0-9._-]+/gi, "_");
}

function getInputBasename(value: string): string {
    if (isUrl(value)) {
        const url = new URL(value);
        return safeName(basename(url.pathname));
    }

    return safeName(basename(value));
}

function makeTmpMdPath(input: string): string {
    const dir = join(tmpdir(), "pi-summarize-out");
    mkdirSync(dir, { recursive: true });

    const base = getInputBasename(input);
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(16).slice(2, 8);

    return join(dir, `${base}-${stamp}-${rand}.md`);
}

function runCommand(
    command: string,
    args: string[],
    options: SpawnSyncOptionsWithStringEncoding,
    errorPrefix: string,
): string {
    const result = spawnSync(command, args, options);

    if (result.error) {
        throw new Error(`Failed to run ${command}: ${result.error.message}`);
    }

    if (result.status !== 0) {
        const stderr = (result.stderr || "").trim();
        throw new Error(`${errorPrefix}${stderr ? `\n${stderr}` : ""}`);
    }

    return result.stdout ?? "";
}

function runMarkitdown(input: string): string {
    return runCommand(
        "uvx",
        ["markitdown", input],
        {
            encoding: "utf-8",
            maxBuffer: 50 * 1024 * 1024,
        },
        `markitdown failed for ${input}`,
    );
}

function summarizeWithPi(markdown: string, options: SummaryOptions = {}): string {
    const { mdPathForNote = null, extraPrompt = null } = options;

    const MAX_CHARS = 140_000;
    const head = markdown.slice(0, 110_000);
    const tail = markdown.slice(-20_000);
    const truncated = markdown.length > MAX_CHARS;
    const body = truncated
        ? `${head}\n\n[...TRUNCATED ${markdown.length - (head.length + tail.length)} chars...]\n\n${tail}`
        : markdown;

    const note = mdPathForNote
        ? `\n\n(Generated markdown file: ${mdPathForNote})\n`
        : "";
    const truncNote = truncated
        ? "\n\nNote: Input was truncated due to size."
        : "";

    const contextBlock = extraPrompt
        ? `\n\nUser-provided context / instructions (follow these closely):\n${extraPrompt}\n`
        : "\n\nNo extra context was provided. If the summary seems misaligned, ask the user for what to focus on (goals, audience, what to extract).\n";

    const prompt = `You are summarizing a document that has been converted to Markdown.${note}
${contextBlock}
Please produce:
- A short 1-paragraph executive summary
- 8-15 bullet points of key facts / decisions / requirements
- A section "Open questions / missing info" (bullets)

Be concise. Preserve important numbers, names, and constraints.
${truncNote}

--- BEGIN DOCUMENT (Markdown) ---
${body}
--- END DOCUMENT ---`;

    return runCommand(
        "pi",
        [
            "--provider",
            "anthropic",
            "--model",
            "claude-haiku-4-5",
            "--no-tools",
            "--no-session",
            "-p",
            prompt,
        ],
        {
            encoding: "utf-8",
            maxBuffer: 20 * 1024 * 1024,
            timeout: 120_000,
        },
        "pi failed",
    ).trim();
}

function parseArgs(args: string[]): ParsedArgs {
    let input: string | null = null;
    let outPath: string | null = null;
    let writeTmp = false;
    let doSummary = false;
    let summaryPrompt: string | null = null;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === "--tmp") {
            writeTmp = true;
            continue;
        }

        if (arg === "--summary") {
            doSummary = true;
            const next = args[i + 1];
            if (input && next && !isFlag(next) && summaryPrompt == null) {
                summaryPrompt = next;
                i++;
            }
            continue;
        }

        if (arg === "--out" || arg === "--prompt" || arg === "--summary-prompt") {
            const value = args[i + 1] ?? null;
            if (!value || isFlag(value)) {
                fail(`Expected a value after ${arg}`);
            }

            if (arg === "--out") {
                outPath = value;
            } else {
                summaryPrompt = value;
            }

            i++;
            continue;
        }

        if (isFlag(arg)) {
            fail(`Unknown flag: ${arg}`);
        }

        if (!input) {
            input = arg;
            continue;
        }

        if (doSummary && summaryPrompt == null) {
            summaryPrompt = arg;
            continue;
        }

        fail(`Unexpected argument: ${arg}`);
    }

    if (!input) {
        fail("Missing <url-or-path>");
    }

    return {
        input,
        outPath,
        writeTmp,
        doSummary,
        summaryPrompt,
    };
}

function main(): void {
    const scriptName = basename(process.argv[1] ?? "to-markdown.ts");
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
        usage(scriptName);
        process.exit(args.length === 0 ? 1 : 0);
    }

    const { input, outPath, writeTmp, doSummary, summaryPrompt } = parseArgs(args);

    if (!isUrl(input) && !existsSync(input)) {
        fail(`File not found: ${input}`);
    }

    const markdown = runMarkitdown(input);

    if (outPath) {
        writeFileSync(outPath, markdown, "utf-8");
    }

    const shouldWriteTmp = writeTmp || doSummary;
    const tmpMdPath = shouldWriteTmp ? makeTmpMdPath(input) : null;
    if (tmpMdPath) {
        writeFileSync(tmpMdPath, markdown, "utf-8");
    }

    if (writeTmp && tmpMdPath && !doSummary && !outPath) {
        console.log(tmpMdPath);
        return;
    }

    if (!doSummary) {
        process.stdout.write(markdown);
        return;
    }

    const summary = summarizeWithPi(markdown, {
        mdPathForNote: tmpMdPath ?? outPath,
        extraPrompt: summaryPrompt,
    });
    process.stdout.write(summary);

    if (tmpMdPath) {
        process.stdout.write(`\n\n[Hint: Full document Markdown saved to: ${tmpMdPath}]\n`);
    }
}

try {
    main();
} catch (error) {
    fail((error as Error)?.message ?? String(error));
}
