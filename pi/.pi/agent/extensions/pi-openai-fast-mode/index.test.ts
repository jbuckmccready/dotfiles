import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import type { Api, Model } from "@earendil-works/pi-ai";

import {
    getFastModeStatusText,
    loadConfig,
    patchFastModePayload,
    resolveFastModeCommand,
    saveConfig,
    supportsFastMode,
    type FastModeConfig,
} from "./index.js";

const originalHome = process.env.HOME;
let testHome = "";

before(async () => {
    testHome = await mkdtemp(path.join(os.tmpdir(), "pi-openai-fast-mode-test-"));
    process.env.HOME = testHome;
});

beforeEach(async () => {
    await rm(path.join(testHome, ".pi"), { recursive: true, force: true });
});

after(async () => {
    await rm(testHome, { recursive: true, force: true });

    if (originalHome === undefined) {
        delete process.env.HOME;
    } else {
        process.env.HOME = originalHome;
    }
});

function createModel(overrides?: Partial<Model<Api>>): Model<Api> {
    return {
        id: "gpt-5.4",
        name: "GPT-5.4",
        provider: "openai",
        api: "openai-responses",
        baseUrl: "https://api.openai.com/v1",
        reasoning: true,
        input: ["text"],
        cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
        },
        contextWindow: 272000,
        maxTokens: 128000,
        ...overrides,
    };
}

describe("pi-openai-fast-mode helpers", () => {
    it("resolves toggle, on, and off commands", () => {
        assert.equal(resolveFastModeCommand(undefined, false), true);
        assert.equal(resolveFastModeCommand("", true), false);
        assert.equal(resolveFastModeCommand(" ON ", false), true);
        assert.equal(resolveFastModeCommand("off", true), false);
        assert.equal(resolveFastModeCommand("toggle", false), undefined);
    });

    it("supports the OpenAI Responses APIs", () => {
        assert.equal(supportsFastMode(createModel()), true);
        assert.equal(supportsFastMode(createModel({ api: "openai-codex-responses" })), true);
        assert.equal(supportsFastMode(createModel({ api: "anthropic-messages" })), false);
    });

    it("patches service_tier without dropping payload fields", () => {
        assert.deepEqual(patchFastModePayload({ model: "gpt-5.4", stream: true }), {
            model: "gpt-5.4",
            stream: true,
            service_tier: "priority",
        });
    });

    it("shows status only when enabled for a supported API", () => {
        assert.equal(getFastModeStatusText({ enabled: true }, createModel()), "⚡ fast");
        assert.equal(getFastModeStatusText({ enabled: false }, createModel()), undefined);
        assert.equal(
            getFastModeStatusText({ enabled: true }, createModel({ api: "anthropic-messages" })),
            undefined,
        );
    });
});

describe("pi-openai-fast-mode config io", () => {
    it("loads missing or invalid config as disabled", async () => {
        assert.deepEqual(await loadConfig(), { enabled: false });

        const configPath = path.join(testHome, ".pi", "agent", "fast-mode.json");
        await saveConfig({ enabled: true });
        await writeFile(configPath, JSON.stringify({ enabled: "yes" }), "utf8");

        assert.deepEqual(await loadConfig(), { enabled: false });
    });

    it("saves config with pretty JSON", async () => {
        await saveConfig({ enabled: true });

        const raw = await readFile(path.join(testHome, ".pi", "agent", "fast-mode.json"), "utf8");
        assert.equal(raw, `{
    "enabled": true
}\n`);
    });
});

type TestContext = {
    hasUI: boolean;
    model: Model<Api> | undefined;
    ui: {
        notify: (message: string, level?: string) => void;
        setStatus: (key: string, text: string | undefined) => void;
    };
};

type Spy<TArgs extends unknown[] = unknown[]> = ((...args: TArgs) => void) & {
    calls: TArgs[];
};

function createSpy<TArgs extends unknown[]>(): Spy<TArgs> {
    const calls: TArgs[] = [];
    const spy = ((...args: TArgs) => {
        calls.push(args);
    }) as Spy<TArgs>;
    spy.calls = calls;
    return spy;
}

function createContext(model: Model<Api> | undefined): {
    ctx: TestContext;
    notifyMock: Spy<[string, string?]>;
    setStatusMock: Spy<[string, string | undefined]>;
} {
    const notifyMock = createSpy<[string, string?]>();
    const setStatusMock = createSpy<[string, string | undefined]>();

    return {
        ctx: {
            hasUI: true,
            model,
            ui: {
                notify: notifyMock,
                setStatus: setStatusMock,
            },
        },
        notifyMock,
        setStatusMock,
    };
}

async function createRuntime(config: FastModeConfig) {
    await saveConfig(config);

    const { default: fastModeExtension } = await import("./index.js");

    let sessionStartHandler: ((event: unknown, ctx: TestContext) => Promise<void> | void) | undefined;
    let sessionShutdownHandler: ((event: unknown, ctx: TestContext) => Promise<void> | void) | undefined;
    let modelSelectHandler: ((event: { model: Model<Api> }, ctx: TestContext) => Promise<void> | void) | undefined;
    let beforeProviderRequestHandler: ((event: { payload: unknown }, ctx: TestContext) => unknown) | undefined;
    let shortcutHandler: ((ctx: TestContext) => Promise<void> | void) | undefined;
    let commandHandler: ((args: string, ctx: TestContext) => Promise<void> | void) | undefined;

    const pi = {
        on: (event: string, handler: (event: unknown, ctx: TestContext) => Promise<void> | void) => {
            if (event === "session_start") sessionStartHandler = handler;
            if (event === "session_shutdown") sessionShutdownHandler = handler;
            if (event === "model_select") {
                modelSelectHandler = handler as (event: { model: Model<Api> }, ctx: TestContext) => Promise<void> | void;
            }
            if (event === "before_provider_request") {
                beforeProviderRequestHandler = handler as (event: { payload: unknown }, ctx: TestContext) => unknown;
            }
        },
        registerShortcut: (_shortcut: string, options: { handler: (ctx: TestContext) => Promise<void> | void }) => {
            shortcutHandler = options.handler;
        },
        registerCommand: (_name: string, options: { handler: (args: string, ctx: TestContext) => Promise<void> | void }) => {
            commandHandler = options.handler;
        },
    };

    fastModeExtension(pi as never);

    if (
        !sessionStartHandler ||
        !sessionShutdownHandler ||
        !modelSelectHandler ||
        !beforeProviderRequestHandler ||
        !shortcutHandler ||
        !commandHandler
    ) {
        throw new Error("Extension did not register expected handlers");
    }

    return {
        sessionStartHandler,
        sessionShutdownHandler,
        modelSelectHandler,
        beforeProviderRequestHandler,
        shortcutHandler,
        commandHandler,
    };
}

describe("pi-openai-fast-mode runtime", () => {
    it("toggles, persists, updates status, and patches supported requests", async () => {
        const runtime = await createRuntime({ enabled: false });
        const { ctx, notifyMock, setStatusMock } = createContext(createModel());

        await runtime.sessionStartHandler({}, ctx);
        await runtime.commandHandler("", ctx);

        assert.deepEqual(JSON.parse(await readFile(path.join(testHome, ".pi", "agent", "fast-mode.json"), "utf8")), {
            enabled: true,
        });
        assert.deepEqual(setStatusMock.calls.at(-1), ["fast-mode", "⚡ fast"]);
        assert.deepEqual(notifyMock.calls.at(-1), ["Fast Mode → on", "info"]);
        assert.deepEqual(runtime.beforeProviderRequestHandler({ payload: { model: "gpt-5.4" } }, ctx), {
            model: "gpt-5.4",
            service_tier: "priority",
        });

        await runtime.shortcutHandler(ctx);
        assert.deepEqual(setStatusMock.calls.at(-1), ["fast-mode", undefined]);
        assert.equal(runtime.beforeProviderRequestHandler({ payload: { model: "gpt-5.4" } }, ctx), undefined);
    });

    it("does not patch unsupported requests and follows model selection", async () => {
        const runtime = await createRuntime({ enabled: true });
        const { ctx, setStatusMock } = createContext(createModel());

        await runtime.sessionStartHandler({}, ctx);
        const unsupported = createModel({ api: "anthropic-messages", provider: "anthropic" });
        await runtime.modelSelectHandler({ model: unsupported }, { ...ctx, model: unsupported });

        assert.deepEqual(setStatusMock.calls.at(-1), ["fast-mode", undefined]);
        assert.equal(
            runtime.beforeProviderRequestHandler({ payload: { model: "claude" } }, { ...ctx, model: unsupported }),
            undefined,
        );
    });

    it("rejects invalid command arguments and clears status on shutdown", async () => {
        const runtime = await createRuntime({ enabled: false });
        const { ctx, notifyMock, setStatusMock } = createContext(createModel());

        await runtime.sessionStartHandler({}, ctx);
        await runtime.commandHandler("toggle", ctx);
        assert.deepEqual(notifyMock.calls.at(-1), ['Unknown Fast Mode setting "toggle". Use: on, off', "error"]);

        await runtime.sessionShutdownHandler({}, ctx);
        assert.deepEqual(setStatusMock.calls.at(-1), ["fast-mode", undefined]);
    });
});
