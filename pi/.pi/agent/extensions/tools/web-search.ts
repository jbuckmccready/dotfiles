import type {
    AgentToolResult,
    ExtensionAPI,
    ExtensionContext,
    Theme,
    ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";

import { keyHint } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { Type } from "typebox";
import type { SandboxAPI } from "./sandbox-shared";
import { getToolViewMode, type ToolViewMode } from "./tool-view-mode";

// --- Constants ---

const ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const MODEL = "gpt-5.4-mini";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const CONDENSED_OUTPUT_LINES = 5;
const MARKDOWN_TMP_FILE_THRESHOLD_CHARS = 100_000;
const MARKDOWN_PREVIEW_CHARS = 20_000;
const MARKITDOWN_PYTHON = "3.12";
const MARKITDOWN_TIMEOUT_MS = 15_000;
const MARKITDOWN_COMMAND_LABEL = `uvx --python ${MARKITDOWN_PYTHON} markitdown`;

type SearchMode = "search" | "fetch" | "answer_url";

// --- Helpers ---

function decodeJwtAccountId(jwt: string): string | undefined {
    try {
        const parts = jwt.split(".");
        if (parts.length !== 3) return undefined;
        const payload = JSON.parse(
            Buffer.from(parts[1], "base64url").toString("utf8"),
        );
        return payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
    } catch {
        return undefined;
    }
}

function isRetryable(status: number): boolean {
    return status === 429 || status >= 500;
}

function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function isSearchMode(value: string): value is SearchMode {
    return value === "search" || value === "fetch" || value === "answer_url";
}

function safeName(value: string | undefined): string {
    return (value || "document").replace(/[^a-z0-9._-]+/gi, "_");
}

type MarkdownTmpPath = {
    hostPath: string;
    agentPath: string;
};

function makeTmpMarkdownPath(
    input: string,
    sandbox: SandboxAPI,
): MarkdownTmpPath {
    const dir = sandbox.getSharedTempDir("pi-web-search-out");
    mkdirSync(dir.hostPath, { recursive: true });

    const url = new URL(input);
    const base = safeName(basename(url.pathname) || url.hostname);
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(16).slice(2, 8);
    const filename = `${base}-${stamp}-${rand}.md`;

    return {
        hostPath: join(dir.hostPath, filename),
        agentPath: join(dir.agentPath, filename),
    };
}

async function writeTmpMarkdownIfLarge(
    input: string,
    markdown: string,
    sandbox: SandboxAPI,
): Promise<string | undefined> {
    if (markdown.length <= MARKDOWN_TMP_FILE_THRESHOLD_CHARS) return undefined;

    const path = makeTmpMarkdownPath(input, sandbox);
    writeFileSync(path.hostPath, markdown, "utf-8");

    if (sandbox.isActive()) {
        const readOps = sandbox.getOps().read;
        if (!readOps) {
            throw new Error("Sandbox does not provide read operations");
        }
        await readOps.access(path.agentPath);
    }

    return path.agentPath;
}

function formatFetchedMarkdown(
    url: string,
    markdown: string,
    markdownPath: string | undefined,
): string {
    const preview = markdownPath
        ? markdown.slice(0, MARKDOWN_PREVIEW_CHARS).trimEnd()
        : markdown;

    return [
        `Source URL: ${url}`,
        "Fetched with: markitdown",
        ...(markdownPath
            ? [
                  `Full Markdown saved to: ${markdownPath}`,
                  `Returned preview: first ${preview.length} of ${markdown.length} characters`,
              ]
            : []),
        "",
        "---",
        "",
        preview,
        ...(markdownPath
            ? [
                  "",
                  `[Preview truncated. Full Markdown saved to: ${markdownPath}]`,
              ]
            : []),
    ].join("\n");
}

async function runMarkitdown(
    input: string,
    signal?: AbortSignal,
): Promise<string> {
    if (signal?.aborted) throw new Error("Request was aborted");

    return await new Promise<string>((resolve, reject) => {
        const child = spawn(
            "uvx",
            ["--python", MARKITDOWN_PYTHON, "markitdown", input],
            {
                shell: false,
                stdio: ["ignore", "pipe", "pipe"],
            },
        );

        let stdout = "";
        let stderr = "";
        let wasAborted = false;
        let timedOut = false;
        let settled = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;

        const finish = (error: Error | null, output?: string) => {
            if (settled) return;
            settled = true;
            if (timeout) clearTimeout(timeout);
            signal?.removeEventListener("abort", abort);
            if (error) reject(error);
            else resolve(output ?? "");
        };

        const abort = () => {
            wasAborted = true;
            child.kill("SIGTERM");
        };

        timeout = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
        }, MARKITDOWN_TIMEOUT_MS);

        signal?.addEventListener("abort", abort, { once: true });

        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
            stdout += chunk;
        });

        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk: string) => {
            stderr += chunk;
        });

        child.on("error", (error: NodeJS.ErrnoException) => {
            if (wasAborted || signal?.aborted) {
                finish(new Error("Request was aborted"));
                return;
            }

            if (timedOut) {
                finish(
                    new Error(
                        `${MARKITDOWN_COMMAND_LABEL} timed out after ${MARKITDOWN_TIMEOUT_MS / 1000}s for ${input}`,
                    ),
                );
                return;
            }

            const hint =
                error.code === "ENOENT"
                    ? "\nInstall uv or ensure uvx is on PATH."
                    : "";
            finish(
                new Error(
                    `Failed to run ${MARKITDOWN_COMMAND_LABEL}: ${error.message}${hint}`,
                ),
            );
        });

        child.on("close", (code) => {
            if (wasAborted || signal?.aborted) {
                finish(new Error("Request was aborted"));
                return;
            }

            if (timedOut) {
                finish(
                    new Error(
                        `${MARKITDOWN_COMMAND_LABEL} timed out after ${MARKITDOWN_TIMEOUT_MS / 1000}s for ${input}`,
                    ),
                );
                return;
            }

            if (code === 0) {
                finish(null, stdout);
                return;
            }

            const message = stderr.trim();
            finish(
                new Error(
                    `${MARKITDOWN_COMMAND_LABEL} failed for ${input}${
                        message ? `\n${message}` : ""
                    }`,
                ),
            );
        });
    });
}

async function* parseSSE(response: Response): AsyncGenerator<any> {
    if (!response.body) return;
    const reader = (response.body as any).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx = buffer.indexOf("\n\n");
            while (idx !== -1) {
                const chunk = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                const dataLines = chunk
                    .split("\n")
                    .filter((l: string) => l.startsWith("data:"))
                    .map((l: string) => l.slice(5).trim());
                if (dataLines.length > 0) {
                    const data = dataLines.join("\n").trim();
                    if (data && data !== "[DONE]") {
                        try {
                            yield JSON.parse(data);
                        } catch {}
                    }
                }
                idx = buffer.indexOf("\n\n");
            }
        }
    } finally {
        try {
            await reader.cancel();
        } catch {}
        try {
            reader.releaseLock();
        } catch {}
    }
}

function describeActivity(action: any, done: boolean): string {
    if (!action) return done ? "Search complete" : "Searching…";
    switch (action.type) {
        case "search": {
            const q = action.query || action.queries?.[0] || "";
            if (!q) return done ? "Search complete" : "Searching…";
            return done ? `Searched "${q}"` : `Searching "${q}"`;
        }
        case "open_page":
            if (!action.url) return done ? "Read page" : "Reading page…";
            return done ? `Read ${action.url}` : `Reading ${action.url}`;
        case "find_in_page": {
            const parts: string[] = [];
            if (action.pattern) parts.push(`"${action.pattern}"`);
            if (action.url) parts.push(`in ${action.url}`);
            if (!parts.length) return done ? "Scanned page" : "Scanning page…";
            return (done ? "Found " : "Scanning ") + parts.join(" ");
        }
        default:
            return done ? "Done" : "Working…";
    }
}

function component(renderFn: (width: number) => string[]): Component {
    let cachedWidth: number | undefined;
    let cachedLines: string[] | undefined;
    return {
        invalidate() {
            cachedWidth = undefined;
            cachedLines = undefined;
        },
        render(width: number) {
            if (cachedLines && cachedWidth === width) return cachedLines;
            cachedLines = renderFn(width).map((line) =>
                truncateToWidth(line, width),
            );
            cachedWidth = width;
            return cachedLines;
        },
    };
}

function wrapLines(lines: string[], width: number): string[] {
    const wrapped: string[] = [];
    for (const line of lines) {
        const next = wrapTextWithAnsi(line, width);
        wrapped.push(...(next.length > 0 ? next : [""]));
    }
    return wrapped;
}

function renderCallParameter(
    name: string,
    value: string | undefined,
    width: number,
    theme: Theme,
    expanded: boolean,
): string[] {
    if (!value) return [];
    const valueColor =
        name === "query" || name === "url" || name === "mode"
            ? "accent"
            : "toolOutput";
    const line = theme.fg("muted", `${name}: `) + theme.fg(valueColor, value);
    return expanded
        ? wrapTextWithAnsi(line, width)
        : [truncateToWidth(line, width)];
}

// --- Render types ---

type WebSearchRenderState = {
    startedAt?: number;
    endedAt?: number;
    interval?: ReturnType<typeof setInterval>;
    activityCount?: number;
};

type RenderContext = {
    state: WebSearchRenderState;
    executionStarted: boolean;
    invalidate: () => void;
    isError: boolean;
};

type Details = {
    query?: string;
    url?: string;
    mode?: SearchMode;
    model: string;
    activities?: string[];
    markdownPath?: string;
};

let currentViewMode: ToolViewMode = getToolViewMode();

function setViewMode(mode: ToolViewMode) {
    currentViewMode = mode;
}

// --- Extension ---

export function registerWebSearchTool(pi: ExtensionAPI, sandbox: SandboxAPI) {
    pi.events.on("tool-view-mode", (mode: unknown) => {
        setViewMode(mode as ToolViewMode);
    });

    const params = Type.Object({
        query: Type.Optional(
            Type.String({
                description:
                    "The query to search for. With url and answer_url, this can be the question about the page.",
            }),
        ),
        url: Type.Optional(
            Type.String({
                description:
                    "A specific http:// or https:// URL to fetch or answer questions about.",
            }),
        ),
        mode: Type.Optional(
            Type.Union(
                [
                    Type.Literal("search"),
                    Type.Literal("fetch"),
                    Type.Literal("answer_url"),
                ],
                {
                    description:
                        "Operation mode. search uses web search for query. fetch returns Markdown for url using markitdown. Large pages return a preview and save full Markdown to a temp file. answer_url reads url with web search and answers a question.",
                },
            ),
        ),
        question: Type.Optional(
            Type.String({
                description:
                    "Specific question to answer about url when mode is answer_url.",
            }),
        ),
        instructions: Type.Optional(
            Type.String({
                description:
                    "Optional instructions for search or answer_url responses, e.g. what to focus on or how to format the answer.",
            }),
        ),
    });
    pi.registerTool<typeof params, Details, WebSearchRenderState>({
        name: "web_search",
        label: "Web",
        description:
            "Search the web, fetch URL content as Markdown, or answer questions about a URL. Use when the user asks about recent events, live data, or a page whose content is needed.",
        promptSnippet:
            "Use web_search to search the web, fetch URL content as Markdown, or answer questions about a URL",
        promptGuidelines: [
            "Use web_search when the user asks about current events, recent releases, live data, or anything potentially after your training cutoff.",
            "Use mode search with query for broad web research. Prefer a single, well-crafted query with relevant context.",
            "Use mode fetch with url when page content is needed. It returns Markdown converted by markitdown. Large pages return a preview and save full Markdown to a temp file.",
            "Use mode answer_url with url and question when asking a specific question about a page, or when complete content is not needed.",
            "If mode is omitted, url plus question, instructions, or query uses answer_url, url alone uses fetch, and query alone uses search.",
            "Do not use web_search for questions you can confidently answer from training data.",
        ],
        parameters: params,

        async execute(
            _toolCallId,
            params,
            signal,
            onUpdate,
            ctx: ExtensionContext,
        ) {
            const query = params.query?.trim();
            const url = params.url?.trim();
            const requestedMode = params.mode?.trim();
            const explicitQuestion = params.question?.trim();
            const explicitInstructions = params.instructions?.trim();

            if (!query && !url)
                throw new Error("Either query or url must be provided.");
            if (url && !isHttpUrl(url))
                throw new Error("url must be an http:// or https:// URL.");
            let explicitMode: SearchMode | undefined;
            if (requestedMode) {
                if (!isSearchMode(requestedMode)) {
                    throw new Error(
                        'mode must be one of "search", "fetch", or "answer_url".',
                    );
                }
                explicitMode = requestedMode;
            }

            const mode: SearchMode =
                explicitMode ??
                (url
                    ? explicitQuestion || explicitInstructions || query
                        ? "answer_url"
                        : "fetch"
                    : "search");
            const question =
                explicitQuestion ?? (mode === "answer_url" ? query : undefined);
            const extraInstructions = explicitInstructions;

            if (mode === "search" && !query)
                throw new Error("query must be provided when mode is search.");
            if ((mode === "fetch" || mode === "answer_url") && !url) {
                throw new Error(
                    "url must be provided when mode is fetch or answer_url.",
                );
            }

            if (mode === "fetch") {
                const activities = [`🔍 Converting ${url} to Markdown`];
                onUpdate?.({
                    content: [{ type: "text", text: activities.join("\n") }],
                    details: undefined as any,
                });

                let markdown: string;
                try {
                    markdown = (await runMarkitdown(url!, signal)).trimEnd();
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    throw new Error(
                        `Complete URL fetch failed via markitdown for ${url}. Use mode "answer_url" with a question if a synthesized answer is acceptable.\n${message}`,
                    );
                }

                if (!markdown.trim())
                    throw new Error("markitdown returned no content");

                activities[0] = `✅ Converted ${url} to Markdown`;
                const markdownPath = await writeTmpMarkdownIfLarge(
                    url!,
                    markdown,
                    sandbox,
                );
                if (markdownPath) {
                    activities.push(`✅ Saved Markdown to ${markdownPath}`);
                }

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: formatFetchedMarkdown(
                                url!,
                                markdown,
                                markdownPath,
                            ),
                        },
                    ],
                    details: {
                        query: params.query,
                        url,
                        mode,
                        model: "markitdown",
                        activities,
                        markdownPath,
                    },
                };
            }

            // 1. Auth
            const apiKey =
                await ctx.modelRegistry.getApiKeyForProvider("openai-codex");
            if (!apiKey)
                throw new Error(
                    "No openai-codex credentials configured. Run /login to authenticate.",
                );
            const accountId = decodeJwtAccountId(apiKey);
            if (!accountId)
                throw new Error(
                    "Could not extract ChatGPT account ID from token.",
                );

            // 2. Build request
            const headers = {
                Authorization: `Bearer ${apiKey}`,
                "chatgpt-account-id": accountId,
                "OpenAI-Beta": "responses=experimental",
                accept: "text/event-stream",
                "content-type": "application/json",
                originator: "pi",
            };
            const codexInstructions =
                mode === "answer_url"
                    ? "You are a web research assistant. Open the provided URL and answer the user's question using that page. Include the source URL."
                    : "You are a web research assistant. Search the web and provide a concise, well-sourced answer. Include full URLs for all sources.";
            const userContent =
                mode === "answer_url"
                    ? `Read this page: ${url}\n\nQuestion: ${
                          question ?? "Provide a thorough summary of the page."
                      }`
                    : query!;
            const body = JSON.stringify({
                model: MODEL,
                store: false,
                stream: true,
                instructions: codexInstructions,
                input: [
                    { role: "user", content: userContent },
                    ...(extraInstructions
                        ? [
                              {
                                  role: "user",
                                  content: `Additional instructions:\n${extraInstructions}`,
                              },
                          ]
                        : []),
                ],
                tools: [{ type: "web_search" }],
                tool_choice: "auto",
                reasoning: { effort: "medium", summary: "auto" },
            });

            // 3. Fetch with retry
            let response: Response | undefined;
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                if (signal?.aborted) throw new Error("Request was aborted");
                response = await fetch(ENDPOINT, {
                    method: "POST",
                    headers,
                    body,
                    signal,
                });
                if (response.ok) break;
                const errorText = await response.text();
                if (attempt < MAX_RETRIES && isRetryable(response.status)) {
                    await new Promise((r) =>
                        setTimeout(r, BASE_DELAY_MS * 2 ** attempt),
                    );
                    continue;
                }
                throw new Error(
                    `Web search request failed (${response.status}): ${errorText}`,
                );
            }

            // 4. Parse SSE stream
            let text = "";
            let fallbackText = "";
            const searchActivities: string[] = [];

            function formatProgress(): string {
                const lines = [...searchActivities];
                if (text) lines.push("", text);
                return lines.join("\n");
            }

            function emitProgress() {
                onUpdate?.({
                    content: [{ type: "text", text: formatProgress() }],
                    details: undefined as any,
                });
            }

            for await (const event of parseSSE(response!)) {
                if (signal?.aborted) break;

                switch (event.type) {
                    case "response.output_item.added":
                        if (event.item?.type === "web_search_call") {
                            searchActivities.push(
                                `🔍 ${describeActivity(event.item.action, false)}`,
                            );
                            emitProgress();
                        }
                        break;

                    case "response.output_item.done":
                        if (event.item?.type === "web_search_call") {
                            if (searchActivities.length > 0) {
                                searchActivities[searchActivities.length - 1] =
                                    `✅ ${describeActivity(event.item.action, true)}`;
                            }
                            emitProgress();
                        }
                        if (event.item?.type === "message") {
                            const parts = Array.isArray(event.item?.content)
                                ? event.item.content
                                : [];
                            const full = parts
                                .filter(
                                    (p: any) =>
                                        p.type === "output_text" &&
                                        typeof p.text === "string",
                                )
                                .map((p: any) => p.text)
                                .join("\n");
                            if (full) fallbackText = full;
                        }
                        break;

                    case "response.web_search_call.searching":
                    case "response.web_search_call.in_progress":
                        if (searchActivities.length === 0) {
                            searchActivities.push("🔍 Searching…");
                            emitProgress();
                        }
                        break;

                    case "response.output_text.delta":
                        if (typeof event.delta === "string") {
                            text += event.delta;
                            emitProgress();
                        }
                        break;

                    case "error":
                        throw new Error(event.message || "Codex stream error");

                    case "response.failed":
                        throw new Error(
                            event.response?.error?.message ||
                                "Codex response failed",
                        );
                }
            }

            // 5. Return
            const finalText = (text || fallbackText || "").trim();
            if (!finalText) throw new Error("Web search returned no results");
            return {
                content: [{ type: "text" as const, text: finalText }],
                details: {
                    query: params.query,
                    url,
                    mode,
                    model: MODEL,
                    activities: searchActivities,
                },
            };
        },

        renderCall(
            args: {
                query?: string;
                url?: string;
                mode?: SearchMode;
                question?: string;
                instructions?: string;
            },
            theme: Theme,
            context: RenderContext,
        ) {
            const state = context.state;
            if (context.executionStarted && state.startedAt === undefined) {
                state.startedAt = Date.now();
                state.endedAt = undefined;
            }

            let timerSuffix = "";
            if (state.startedAt !== undefined) {
                const elapsed = (state.endedAt ?? Date.now()) - state.startedAt;
                if (elapsed >= 1000) {
                    timerSuffix =
                        " " +
                        theme.fg("muted", `${Math.round(elapsed / 1000)}s`);
                }
            }

            let activitySuffix = "";
            if (state.activityCount !== undefined && state.activityCount > 0) {
                activitySuffix = theme.fg(
                    "muted",
                    ` • ${state.activityCount} steps`,
                );
            }

            const label = args.url
                ? `${args.mode ?? "url"} ${args.url}`
                : `"${args.query ?? ""}"`;

            return component((width) => {
                const mode = currentViewMode;
                const title =
                    theme.fg("toolTitle", theme.bold("web_search")) +
                    (mode !== "expanded" && label
                        ? " " + theme.fg("accent", label)
                        : "") +
                    activitySuffix +
                    timerSuffix;
                const lines = wrapTextWithAnsi(title, width);
                if (mode === "condensed") {
                    return [
                        ...lines,
                        ...renderCallParameter(
                            "question",
                            args.question,
                            width,
                            theme,
                            false,
                        ),
                        ...renderCallParameter(
                            "instructions",
                            args.instructions,
                            width,
                            theme,
                            false,
                        ),
                    ];
                }
                if (mode !== "expanded") return lines;

                return [
                    ...lines,
                    ...renderCallParameter(
                        "mode",
                        args.mode,
                        width,
                        theme,
                        true,
                    ),
                    ...renderCallParameter(
                        "query",
                        args.query,
                        width,
                        theme,
                        true,
                    ),
                    ...renderCallParameter(
                        "url",
                        args.url,
                        width,
                        theme,
                        true,
                    ),
                    ...renderCallParameter(
                        "question",
                        args.question,
                        width,
                        theme,
                        true,
                    ),
                    ...renderCallParameter(
                        "instructions",
                        args.instructions,
                        width,
                        theme,
                        true,
                    ),
                ];
            });
        },

        renderResult(
            result: AgentToolResult<Details>,
            { isPartial }: ToolRenderResultOptions,
            theme: Theme,
            context: RenderContext,
        ) {
            const state = context.state;
            state.startedAt ??= Date.now();

            if (isPartial && !state.interval) {
                state.interval = setInterval(() => context.invalidate(), 1000);
            }
            if (!isPartial || context.isError) {
                state.endedAt ??= Date.now();
                if (state.interval) {
                    clearInterval(state.interval);
                    state.interval = undefined;
                }
            }

            const rawText =
                result.content
                    ?.filter((c: any) => c.type === "text")
                    .map((c: any) => c.text || "")
                    .join("\n") || "";

            if (isPartial) {
                const lines = rawText.split("\n");
                const activities = lines.filter(
                    (l) => l.startsWith("🔍") || l.startsWith("✅"),
                );
                if (activities.length !== state.activityCount) {
                    state.activityCount = activities.length;
                    context.invalidate();
                    return component(() => []);
                }

                return component((width) => {
                    if (currentViewMode === "minimal") return [];

                    const styledActivities: string[] = [];
                    const styledOutput: string[] = [];
                    for (const line of lines) {
                        if (line.startsWith("🔍"))
                            styledActivities.push(theme.fg("warning", line));
                        else if (line.startsWith("✅"))
                            styledActivities.push(theme.fg("success", line));
                        else if (line.trim() === "") styledOutput.push("");
                        else styledOutput.push(theme.fg("toolOutput", line));
                    }

                    const maxOutput =
                        currentViewMode === "expanded"
                            ? styledOutput.length
                            : CONDENSED_OUTPUT_LINES;
                    const display = styledOutput.slice(0, maxOutput);
                    const remaining = styledOutput.length - maxOutput;

                    return wrapLines(
                        [
                            ...styledActivities,
                            ...display,
                            ...(remaining > 0
                                ? [
                                      theme.fg(
                                          "muted",
                                          `... (${remaining} more lines)`,
                                      ),
                                  ]
                                : []),
                        ],
                        width,
                    );
                });
            }

            state.activityCount = undefined;

            // Completed: use non-caching component so mode changes take effect
            return {
                invalidate() {},
                render(width: number): string[] {
                    const mode = currentViewMode;
                    if (mode === "minimal") return [];

                    if (!rawText) return [theme.fg("error", "No results")];

                    const activityLines = wrapLines(
                        (result.details?.activities ?? []).map((l: string) =>
                            theme.fg("muted", l.replace("🔍", "✅")),
                        ),
                        width,
                    );
                    const outputLines = wrapLines(
                        rawText
                            .split("\n")
                            .map((line) => theme.fg("toolOutput", line)),
                        width,
                    );

                    if (mode === "expanded") {
                        return activityLines.length
                            ? [...activityLines, "", ...outputLines]
                            : outputLines;
                    }

                    // condensed
                    const preview = outputLines.slice(
                        0,
                        CONDENSED_OUTPUT_LINES,
                    );
                    const remaining =
                        outputLines.length - CONDENSED_OUTPUT_LINES;
                    const hint =
                        remaining > 0
                            ? [
                                  theme.fg(
                                      "muted",
                                      `... (${remaining} more lines, ${keyHint("app.tools.expand", "to expand")})`,
                                  ),
                              ]
                            : [];
                    const content = [...preview, ...hint];
                    return activityLines.length
                        ? [...activityLines, "", ...content]
                        : content;
                },
            } as Component;
        },
    });
}
