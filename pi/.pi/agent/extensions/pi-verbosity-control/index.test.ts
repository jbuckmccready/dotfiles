import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import type { Api, Model } from "@mariozechner/pi-ai";

import {
    cycleVerbosity,
    getExactModelKey,
    getVerbosityStatusText,
    loadConfig,
    patchPayloadVerbosity,
    resolveConfiguredVerbosity,
    saveConfig,
    type VerbosityConfig,
} from "./index.js";

const originalHome = process.env.HOME;
let testHome = "";

before(async () => {
    testHome = await mkdtemp(path.join(os.tmpdir(), "pi-verbosity-control-test-"));
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
        provider: "openai-codex",
        api: "openai-codex-responses",
        baseUrl: "https://chatgpt.com/backend-api",
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

describe("pi-verbosity-control helpers", () => {
    it("cycles verbosity in a loop", () => {
        assert.equal(cycleVerbosity(undefined), "low");
        assert.equal(cycleVerbosity("low"), "medium");
        assert.equal(cycleVerbosity("medium"), "high");
        assert.equal(cycleVerbosity("high"), "low");
    });

    it("prefers exact provider/model matches over bare model ids", () => {
        const model = createModel();
        const config: VerbosityConfig = {
            models: {
                "gpt-5.4": "low",
                "openai-codex/gpt-5.4": "high",
            },
        };

        assert.deepEqual(resolveConfiguredVerbosity(config, model), {
            key: "openai-codex/gpt-5.4",
            verbosity: "high",
        });
    });

    it("patches payload text verbosity without dropping existing text fields", () => {
        const payload = {
            model: "gpt-5.4",
            text: {
                format: "plain",
            },
        };

        assert.deepEqual(patchPayloadVerbosity(payload, "low"), {
            model: "gpt-5.4",
            text: {
                format: "plain",
                verbosity: "low",
            },
        });
    });

    it("builds footer status text for configured supported models", () => {
        assert.equal(
            getVerbosityStatusText(
                {
                    models: {
                        "gpt-5.4": "low",
                    },
                },
                createModel(),
            ),
            "🗣 low",
        );
    });

    it("omits footer status text for unsupported models", () => {
        assert.equal(
            getVerbosityStatusText(
                {
                    models: {
                        "gpt-5.4": "low",
                    },
                },
                createModel({ provider: "anthropic", api: "anthropic-messages" }),
            ),
            undefined,
        );
    });
});

describe("pi-verbosity-control config io", () => {
    it("loads missing config as empty", async () => {
        assert.deepEqual(await loadConfig(), { models: {} });
    });

    it("saves config with pretty JSON", async () => {
        const config: VerbosityConfig = {
            models: {
                "gpt-5.4": "low",
            },
        };

        await saveConfig(config);

        const raw = await readFile(path.join(testHome, ".pi", "agent", "verbosity.json"), "utf8");
        assert.equal(
            raw,
            `{
    "models": {
        "gpt-5.4": "low"
    }
}\n`,
        );
    });

    it("ignores invalid config values and keeps valid ones", async () => {
        const configPath = path.join(testHome, ".pi", "agent", "verbosity.json");
        await mkdir(path.dirname(configPath), { recursive: true });
        await writeFile(
            configPath,
            `${JSON.stringify(
                {
                    models: {
                        "gpt-5.4": "LOW",
                        "openai-codex/gpt-5.4": "banana",
                        "": "medium",
                    },
                },
                null,
                4,
            )}\n`,
            "utf8",
        );

        assert.deepEqual(await loadConfig(), {
            models: {
                "gpt-5.4": "low",
            },
        });
    });

    it("builds the expected exact model key", () => {
        assert.equal(getExactModelKey(createModel()), "openai-codex/gpt-5.4");
    });
});

async function createRuntime(config: VerbosityConfig) {
    await saveConfig(config);

    const { default: verbosityControlExtension } = await import("./index.js");

    let sessionStartHandler: ((event: unknown, ctx: TestContext) => Promise<void> | void) | undefined;
    let sessionShutdownHandler: ((event: unknown, ctx: TestContext) => Promise<void> | void) | undefined;
    let modelSelectHandler: ((event: { model: Model<Api> }, ctx: TestContext) => Promise<void> | void) | undefined;
    let beforeProviderRequestHandler: ((event: { payload: unknown }, ctx: TestContext) => unknown) | undefined;
    let shortcutHandler: ((ctx: TestContext) => Promise<void> | void) | undefined;
    let commandHandler: ((args: string | undefined, ctx: TestContext) => Promise<void> | void) | undefined;

    const pi = {
        on: (event: string, handler: (event: unknown, ctx: TestContext) => Promise<void> | void) => {
            if (event === "session_start") {
                sessionStartHandler = handler;
            }
            if (event === "session_shutdown") {
                sessionShutdownHandler = handler;
            }
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
        registerCommand: (_name: string, options: { handler: (args: string | undefined, ctx: TestContext) => Promise<void> | void }) => {
            commandHandler = options.handler;
        },
    };

    verbosityControlExtension(pi as never);

    if (!sessionStartHandler || !sessionShutdownHandler || !modelSelectHandler || !beforeProviderRequestHandler || !shortcutHandler || !commandHandler) {
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

describe("pi-verbosity-control runtime", () => {
    it("sets footer status on session start for configured models", async () => {
        const runtime = await createRuntime({
            models: {
                "gpt-5.4": "low",
            },
        });
        const { ctx, setStatusMock } = createContext(createModel());

        await runtime.sessionStartHandler({}, ctx);

        assert.deepEqual(setStatusMock.calls.at(-1), ["verbosity", "🗣 low"]);
    });

    it("patches requests for configured models after session start", async () => {
        const runtime = await createRuntime({
            models: {
                "gpt-5.4": "low",
            },
        });
        const { ctx } = createContext(createModel());

        await runtime.sessionStartHandler({}, ctx);

        const patched = runtime.beforeProviderRequestHandler(
            {
                payload: {
                    model: "gpt-5.4",
                    stream: true,
                },
            },
            ctx,
        );

        assert.deepEqual(patched, {
            model: "gpt-5.4",
            stream: true,
            text: {
                verbosity: "low",
            },
        });
    });

    it("updates footer status when the active model changes", async () => {
        const runtime = await createRuntime({
            models: {
                "gpt-5.4": "low",
            },
        });
        const { ctx, setStatusMock } = createContext(createModel());

        await runtime.sessionStartHandler({}, ctx);
        await runtime.modelSelectHandler(
            {
                model: createModel({ provider: "anthropic", api: "anthropic-messages" }),
            },
            ctx,
        );

        assert.deepEqual(setStatusMock.calls.at(-1), ["verbosity", undefined]);
    });

    it("cycles, persists, and shows the current model setting from the shortcut", async () => {
        const runtime = await createRuntime({
            models: {
                "gpt-5.4": "low",
            },
        });
        const { ctx, notifyMock, setStatusMock } = createContext(createModel());

        await runtime.sessionStartHandler({}, ctx);
        await runtime.shortcutHandler(ctx);

        const saved = JSON.parse(await readFile(path.join(testHome, ".pi", "agent", "verbosity.json"), "utf8")) as {
            models: Record<string, string>;
        };

        assert.equal(saved.models["gpt-5.4"], "medium");
        assert.deepEqual(setStatusMock.calls.at(-1), ["verbosity", "🗣 medium"]);
        assert.deepEqual(notifyMock.calls.at(-1), ["Verbosity for gpt-5.4 → medium", "info"]);
    });

    it("sets verbosity directly via command with argument", async () => {
        const runtime = await createRuntime({
            models: {
                "gpt-5.4": "low",
            },
        });
        const { ctx, notifyMock, setStatusMock } = createContext(createModel());

        await runtime.sessionStartHandler({}, ctx);
        await runtime.commandHandler("high", ctx);

        const saved = JSON.parse(await readFile(path.join(testHome, ".pi", "agent", "verbosity.json"), "utf8")) as {
            models: Record<string, string>;
        };

        assert.equal(saved.models["gpt-5.4"], "high");
        assert.deepEqual(setStatusMock.calls.at(-1), ["verbosity", "🗣 high"]);
        assert.deepEqual(notifyMock.calls.at(-1), ["Verbosity for gpt-5.4 → high", "info"]);
    });

    it("cycles verbosity via command with no argument", async () => {
        const runtime = await createRuntime({
            models: {
                "gpt-5.4": "low",
            },
        });
        const { ctx, notifyMock } = createContext(createModel());

        await runtime.sessionStartHandler({}, ctx);
        await runtime.commandHandler(undefined, ctx);

        assert.deepEqual(notifyMock.calls.at(-1), ["Verbosity for gpt-5.4 → medium", "info"]);
    });

    it("rejects invalid command argument", async () => {
        const runtime = await createRuntime({
            models: {
                "gpt-5.4": "low",
            },
        });
        const { ctx, notifyMock } = createContext(createModel());

        await runtime.sessionStartHandler({}, ctx);
        await runtime.commandHandler("banana", ctx);

        assert.deepEqual(notifyMock.calls.at(-1), ['Unknown verbosity "banana". Use: low, medium, high', "error"]);
    });

    it("clears footer status on session shutdown", async () => {
        const runtime = await createRuntime({
            models: {
                "gpt-5.4": "low",
            },
        });
        const { ctx, setStatusMock } = createContext(createModel());

        await runtime.sessionShutdownHandler({}, ctx);

        assert.deepEqual(setStatusMock.calls.at(-1), ["verbosity", undefined]);
    });
});
