import assert from "node:assert/strict";
import test from "node:test";
import {
    normalizeSearchCommands,
    registerWebSearchTool,
    resolveSearchModel,
    searchCommandActivity,
    summarizeSearchCommands,
} from "./web-search.ts";

const accountId = "account-123";
const token = [
    "header",
    Buffer.from(
        JSON.stringify({
            "https://api.openai.com/auth": {
                chatgpt_account_id: accountId,
            },
        }),
    ).toString("base64url"),
    "signature",
].join(".");

function registerTool(
    viewMode: "minimal" | "condensed" | "expanded" = "expanded",
): any {
    let tool: any;
    registerWebSearchTool(
        {
            events: {
                on(event: string, handler: (value: string) => void) {
                    if (event === "tool-view-mode") handler(viewMode);
                },
            },
            registerTool(definition: any) {
                tool = definition;
            },
        } as any,
    );
    assert.ok(tool);
    return tool;
}

function context(modelId?: string): any {
    return {
        model: modelId
            ? { provider: "openai-codex", id: modelId }
            : undefined,
        modelRegistry: {
            async getApiKeyForProvider(provider: string) {
                assert.equal(provider, "openai-codex");
                return token;
            },
        },
        sessionManager: {
            getSessionId: () => "session-123",
        },
    };
}

function mockSearchResponse(
    output: string,
    capture: (body: any, input: RequestInfo | URL, init?: RequestInit) => void,
) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
        capture(JSON.parse(String(init?.body)), input, init);
        return new Response(JSON.stringify({ output }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    }) as typeof fetch;
    return () => {
        globalThis.fetch = originalFetch;
    };
}

test("search forwards Codex command arrays and omits the short default", async () => {
    const tool = registerTool();
    let requestBody: any;
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const updates: string[] = [];
    const restoreFetch = mockSearchResponse(
        "search evidence",
        (body, input, init) => {
            requestBody = body;
            requestUrl = String(input);
            requestInit = init;
        },
    );

    try {
        const result = await tool.execute(
            "call-1",
            {
                search_query: [
                    {
                        q: " latest Pi release ",
                        domains: ["github.com", " openai.com "],
                        recency: 30,
                    },
                ],
            },
            undefined,
            (update: any) => updates.push(update.content[0].text),
            context(),
        );

        assert.deepEqual(requestBody, {
            id: "session-123",
            model: "gpt-5.6-luna",
            commands: {
                search_query: [
                    {
                        q: "latest Pi release",
                        domains: ["github.com", "openai.com"],
                        recency: 30,
                    },
                ],
            },
            settings: {
                allowed_callers: ["direct"],
                external_web_access: true,
            },
            max_output_tokens: 10000,
        });
        assert.equal(
            requestUrl,
            "https://chatgpt.com/backend-api/codex/alpha/search",
        );
        const headers = new Headers(requestInit?.headers);
        assert.equal(headers.get("authorization"), `Bearer ${token}`);
        assert.equal(headers.get("chatgpt-account-id"), accountId);
        assert.equal(headers.get("accept"), "application/json");
        assert.equal(headers.has("openai-beta"), false);
        assert.ok(requestInit?.signal instanceof AbortSignal);
        assert.deepEqual(updates, [
            "🔍 Running 1 web operation",
        ]);
        assert.equal(result.content[0].text, "search evidence");
        assert.deepEqual(result.details.commands, requestBody.commands);
        assert.equal(result.details.responseLength, undefined);
    } finally {
        restoreFetch();
    }
});

test("open forwards multiple references and line numbers", async () => {
    const tool = registerTool();
    let requestBody: any;
    const restoreFetch = mockSearchResponse("page evidence", (body) => {
        requestBody = body;
    });

    try {
        const result = await tool.execute(
            "call-2",
            {
                open: [
                    { ref_id: " turn1view0 ", lineno: 120 },
                    { ref_id: "https://example.com/docs" },
                ],
                response_length: "long",
            },
            undefined,
            undefined,
            context("gpt-5.6-terra"),
        );

        assert.equal(requestBody.model, "gpt-5.6-terra");
        assert.deepEqual(requestBody.commands, {
            open: [
                { ref_id: "turn1view0", lineno: 120 },
                { ref_id: "https://example.com/docs" },
            ],
            response_length: "long",
        });
        assert.equal(result.content[0].text, "page evidence");
        assert.equal(result.details.model, "gpt-5.6-terra");
    } finally {
        restoreFetch();
    }
});

test("batches search, open, find, and click commands", async () => {
    const tool = registerTool();
    let requestBody: any;
    const updates: string[] = [];
    const restoreFetch = mockSearchResponse("batched evidence", (body) => {
        requestBody = body;
    });

    try {
        const result = await tool.execute(
            "call-3",
            {
                search_query: [{ q: "Codex release" }],
                open: [{ ref_id: "turn0search0", lineno: 200 }],
                find: [{ ref_id: "turn1view0", pattern: " Changelog " }],
                click: [{ ref_id: "turn1view0", id: 17 }],
                response_length: "medium",
            },
            undefined,
            (update: any) => updates.push(update.content[0].text),
            context(),
        );

        assert.deepEqual(requestBody.commands, {
            search_query: [{ q: "Codex release" }],
            open: [{ ref_id: "turn0search0", lineno: 200 }],
            find: [{ ref_id: "turn1view0", pattern: "Changelog" }],
            click: [{ ref_id: "turn1view0", id: 17 }],
            response_length: "medium",
        });
        assert.deepEqual(updates, [
            "🔍 Running 4 web operations",
        ]);
        assert.equal(result.details.responseLength, "medium");
    } finally {
        restoreFetch();
    }
});

test("validates command arrays and four-query response length", () => {
    assert.throws(
        () => normalizeSearchCommands({}),
        /At least one search_query, open, find, or click command is required/,
    );
    assert.throws(
        () => normalizeSearchCommands({ search_query: [] }),
        /search_query must not be empty/,
    );
    assert.throws(
        () => normalizeSearchCommands({ search_query: [{ q: " " }] }),
        /search_query\[0\]\.q must not be empty/,
    );
    assert.throws(
        () =>
            normalizeSearchCommands({
                search_query: [{ q: "query", domains: [] }],
            }),
        /domains must not be empty/,
    );
    assert.throws(
        () =>
            normalizeSearchCommands({
                search_query: Array.from({ length: 5 }, (_, index) => ({
                    q: `query ${index}`,
                })),
                response_length: "long",
            }),
        /at most four queries/,
    );
    assert.throws(
        () =>
            normalizeSearchCommands({
                search_query: Array.from({ length: 4 }, (_, index) => ({
                    q: `query ${index}`,
                })),
            }),
        /require response_length medium or long/,
    );
    assert.throws(
        () =>
            normalizeSearchCommands({
                search_query: [{ q: "query", recency: -1 }],
            }),
        /recency must be a nonnegative integer/,
    );

    assert.equal(
        normalizeSearchCommands({
            search_query: Array.from({ length: 4 }, (_, index) => ({
                q: `query ${index}`,
            })),
            response_length: "medium",
        }).search_query?.length,
        4,
    );
});

test("uses supported session models and falls back to Luna", () => {
    for (const id of [
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
    ]) {
        assert.equal(resolveSearchModel({ provider: "openai-codex", id }), id);
    }
    assert.equal(
        resolveSearchModel({
            provider: "openai-codex",
            id: "gpt-5.5-codex",
        }),
        "gpt-5.6-luna",
    );
    assert.equal(
        resolveSearchModel({ provider: "anthropic", id: "gpt-5.6-sol" }),
        "gpt-5.6-luna",
    );
    assert.equal(resolveSearchModel(undefined), "gpt-5.6-luna");
});

test("command summaries and progress cover batched rendering", () => {
    const commands = {
        search_query: [{ q: "Codex release" }],
        open: [{ ref_id: "turn0search0", lineno: 120 }],
        find: [{ ref_id: "turn1view0", pattern: "Changelog" }],
        click: [{ ref_id: "turn1view0", id: 17 }],
    };

    assert.deepEqual(summarizeSearchCommands(commands), [
        'search "Codex release"',
        "open turn0search0 near line 120",
        'find "Changelog" in turn1view0',
        "click link 17 in turn1view0",
    ]);
    assert.equal(
        searchCommandActivity(commands),
        "🔍 Running 4 web operations",
    );

    const theme = {
        bold: (text: string) => text,
        fg: (_color: string, text: string) => text,
    };
    const renderContext = {
        state: {},
        executionStarted: false,
        invalidate() {},
        isError: false,
    };
    const expanded = registerTool("expanded")
        .renderCall(commands, theme, renderContext)
        .render(120);
    assert.deepEqual(expanded, [
        "web_search • 4 operations",
        "",
        "1: search",
        "q: Codex release",
        "",
        "2: open",
        "ref_id: turn0search0",
        "lineno: 120",
        "",
        "3: find",
        "ref_id: turn1view0",
        "pattern: Changelog",
        "",
        "4: click",
        "ref_id: turn1view0",
        "id: 17",
        "",
        "response_length: short (default)",
    ]);

    const condensed = registerTool("condensed")
        .renderCall(commands, theme, renderContext)
        .render(120);
    assert.deepEqual(condensed, [
        "web_search • 4 operations",
        '1: search "Codex release"',
        "2: open turn0search0 near line 120",
        '3: find "Changelog" in turn1view0',
        "4: click link 17 in turn1view0",
        "response_length: short (default)",
    ]);
});

test("single operations render directly in the title", () => {
    const commands = {
        search_query: [
            { q: "Codex release", domains: ["github.com"], recency: 30 },
        ],
    };
    const theme = {
        bold: (text: string) => text,
        fg: (_color: string, text: string) => text,
    };
    const renderContext = {
        state: {},
        executionStarted: false,
        invalidate() {},
        isError: false,
    };

    const condensed = registerTool("condensed")
        .renderCall(commands, theme, renderContext)
        .render(120);
    assert.deepEqual(condensed, [
        'web_search search "Codex release"',
        "response_length: short (default)",
    ]);

    const expanded = registerTool("expanded")
        .renderCall(commands, theme, renderContext)
        .render(120);
    assert.deepEqual(expanded, [
        'web_search search "Codex release"',
        "",
        "q: Codex release",
        "domains: github.com",
        "recency: 30",
        "",
        "response_length: short (default)",
    ]);
});

test("partial progress renders immediately as a combined operation count", () => {
    const tool = registerTool("condensed");
    const theme = {
        fg: (_color: string, text: string) => text,
    };
    const renderContext = {
        state: {},
        executionStarted: true,
        invalidate() {},
        isError: false,
    };
    const result = {
        content: [{ type: "text", text: "🔍 Running 3 web operations" }],
    };

    const partial = tool
        .renderResult(result, { isPartial: true }, theme, renderContext)
        .render(120);
    assert.deepEqual(partial, ["🔍 Running 3 web operations"]);

    tool.renderResult(
        result,
        { isPartial: false },
        theme,
        renderContext,
    );
});

test("completed results render endpoint output without progress", () => {
    const theme = {
        fg: (_color: string, text: string) => text,
    };
    const result = {
        content: [{ type: "text", text: "search evidence" }],
    };
    const renderContext = {
        state: {},
        executionStarted: true,
        invalidate() {},
        isError: false,
    };

    const condensed = registerTool("condensed")
        .renderResult(result, { isPartial: false }, theme, renderContext)
        .render(120);
    assert.deepEqual(condensed, ["search evidence"]);

    const expanded = registerTool("expanded")
        .renderResult(result, { isPartial: false }, theme, renderContext)
        .render(120);
    assert.deepEqual(expanded, ["search evidence"]);
});
