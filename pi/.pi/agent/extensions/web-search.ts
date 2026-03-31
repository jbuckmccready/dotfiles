import type {
    AgentToolResult,
    ExtensionAPI,
    ExtensionContext,
    Theme,
    ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";

import { keyHint } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import {
    truncateToWidth,
    visibleWidth,
    wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { getToolViewMode, type ToolViewMode } from "./tools/tool-view-mode";

// --- Constants ---

const ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const MODEL = "gpt-5.4-mini";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

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
    const line =
        theme.fg("muted", `${name}: `) +
        theme.fg(name === "prompt" ? "toolOutput" : "accent", value);
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

type Details = { query?: string; model: string; activities?: string[] };

let currentViewMode: ToolViewMode = getToolViewMode();

function setViewMode(mode: ToolViewMode) {
    currentViewMode = mode;
}

// --- Extension ---

export default function (pi: ExtensionAPI) {
    pi.events.on("tool-view-mode", (mode: unknown) => {
        setViewMode(mode as ToolViewMode);
    });

    const params = Type.Object({
        query: Type.Optional(Type.String({ description: "The search query" })),
        url: Type.Optional(
            Type.String({
                description:
                    "A specific URL to fetch and read. When provided, the assistant reads this page directly instead of searching.",
            }),
        ),
        prompt: Type.Optional(
            Type.String({
                description:
                    "Optional instructions for the search assistant, e.g. what to focus on, how to format the answer, or what details to extract.",
            }),
        ),
    });
    pi.registerTool<typeof params, Details, WebSearchRenderState>({
        name: "web_search",
        label: "Web Search",
        description:
            "Search the web for current information, or fetch a specific URL. Use when the user asks about recent events, current data, or anything that may have changed after your training cutoff. Pass url to read a specific page directly. Returns a synthesized answer with source URLs.",
        promptSnippet:
            "Search the web for current information, or fetch a specific URL, and return a synthesized answer with sources",
        promptGuidelines: [
            "Use web_search when the user asks about current events, recent releases, live data, or anything potentially after your training cutoff.",
            "Prefer a single, well-crafted query over multiple searches. Include relevant context in the query.",
            "When the user provides a specific URL, pass it as the url parameter to fetch that page directly.",
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
            if (!params.query && !params.url)
                throw new Error("Either query or url must be provided.");
            const instructions = params.url
                ? "You are a web research assistant. Open the provided URL and read its contents. Provide a thorough summary of the page. Include the source URL."
                : "You are a web research assistant. Search the web and provide a concise, well-sourced answer. Include full URLs for all sources.";
            const userContent = params.url
                ? `Read this page: ${params.url}${params.query ? `\n\nContext: ${params.query}` : ""}`
                : params.query!;
            const body = JSON.stringify({
                model: MODEL,
                store: false,
                stream: true,
                instructions,
                input: [
                    { role: "user", content: userContent },
                    ...(params.prompt
                        ? [
                              {
                                  role: "user",
                                  content: params.prompt,
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
                    model: MODEL,
                    activities: searchActivities,
                },
            };
        },

        renderCall(
            args: { query?: string; url?: string; prompt?: string },
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

            const label = args.url ? args.url : `"${args.query ?? ""}"`;
            const mode = currentViewMode;
            const title =
                theme.fg("toolTitle", theme.bold("web_search")) +
                (mode === "minimal" && label
                    ? " " + theme.fg("accent", label)
                    : "") +
                activitySuffix +
                timerSuffix;

            return component((width) => {
                const lines = wrapTextWithAnsi(title, width);
                if (mode === "minimal") return lines;

                return [
                    ...lines,
                    ...renderCallParameter(
                        "query",
                        args.query,
                        width,
                        theme,
                        mode === "expanded",
                    ),
                    ...renderCallParameter(
                        "url",
                        args.url,
                        width,
                        theme,
                        mode === "expanded",
                    ),
                    ...renderCallParameter(
                        "prompt",
                        args.prompt,
                        width,
                        theme,
                        mode === "expanded",
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

                    return wrapLines(
                        lines.map((line) => {
                            if (line.startsWith("🔍"))
                                return theme.fg("warning", line);
                            if (line.startsWith("✅"))
                                return theme.fg("success", line);
                            if (line.trim() === "") return "";
                            return theme.fg("toolOutput", line);
                        }),
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
                    const firstLine =
                        rawText.split("\n").find((l) => l.trim()) || "";
                    const hint = ` (${keyHint("app.tools.expand", "to expand")})`;
                    const hintText = theme.fg("muted", hint);
                    const previewText = truncateToWidth(
                        theme.fg(
                            "toolOutput",
                            firstLine.length > 200
                                ? firstLine.slice(0, 200) + "…"
                                : firstLine,
                        ),
                        Math.max(0, width - visibleWidth(hintText)),
                    );
                    const previewLine = truncateToWidth(
                        previewText + hintText,
                        width,
                    );
                    return activityLines.length
                        ? [...activityLines, previewLine]
                        : [previewLine];
                },
            } as Component;
        },
    });
}
