import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionUIContext } from "@mariozechner/pi-coding-agent";
import type { KeyId } from "@mariozechner/pi-tui";

export type Verbosity = "low" | "medium" | "high";

export type VerbosityConfig = {
    models: Record<string, Verbosity>;
};

type JsonObject = Record<string, unknown>;

type SupportedVerbosityApi = "openai-responses" | "openai-codex-responses" | "azure-openai-responses";

type StatusContext = {
    hasUI: boolean;
    model?: Model<Api>;
    ui: Pick<ExtensionUIContext, "setStatus" | "notify">;
};

const DEFAULT_CONFIG: VerbosityConfig = {
    models: {},
};

const STATUS_KEY = "verbosity";
const STATUS_LABEL = "🗣";
const MACOS_SHORTCUT = "alt+v";
const OTHER_SHORTCUT = "ctrl+alt+v";
const SUPPORTED_APIS = new Set<SupportedVerbosityApi>([
    "openai-responses",
    "openai-codex-responses",
    "azure-openai-responses",
]);

export function getGlobalConfigPath(): string {
    return path.join(os.homedir(), ".pi", "agent", "verbosity.json");
}

export function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeVerbosity(value: unknown): Verbosity | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === "low" || normalized === "medium" || normalized === "high") {
        return normalized;
    }

    return undefined;
}

export function parseConfig(value: unknown): VerbosityConfig {
    if (!isObject(value)) {
        return { ...DEFAULT_CONFIG };
    }

    const parsedModels = isObject(value.models) ? value.models : {};
    const models: Record<string, Verbosity> = {};

    for (const [rawKey, rawValue] of Object.entries(parsedModels)) {
        const key = rawKey.trim();
        const verbosity = normalizeVerbosity(rawValue);
        if (!key || !verbosity) {
            continue;
        }

        models[key] = verbosity;
    }

    return { models };
}

export async function loadConfig(configPath = getGlobalConfigPath()): Promise<VerbosityConfig> {
    try {
        const raw = await readFile(configPath, "utf8");
        return parseConfig(JSON.parse(raw) as unknown);
    } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "ENOENT") {
            return { ...DEFAULT_CONFIG };
        }

        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[pi-verbosity-control] Failed to read ${configPath}: ${message}`);
        return { ...DEFAULT_CONFIG };
    }
}

export async function saveConfig(config: VerbosityConfig, configPath = getGlobalConfigPath()): Promise<void> {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 4)}\n`, "utf8");
}

export function getExactModelKey(model: Pick<Model<Api>, "provider" | "id">): string {
    return `${model.provider}/${model.id}`;
}

export function supportsVerbosityControl(model: Pick<Model<Api>, "api"> | undefined): boolean {
    if (!model) {
        return false;
    }

    return SUPPORTED_APIS.has(model.api as SupportedVerbosityApi);
}

export function resolveConfiguredVerbosity(
    config: VerbosityConfig,
    model: Pick<Model<Api>, "provider" | "id">,
): { key?: string; verbosity?: Verbosity } {
    const exactKey = getExactModelKey(model);
    const exactVerbosity = config.models[exactKey];
    if (exactVerbosity) {
        return { key: exactKey, verbosity: exactVerbosity };
    }

    const sharedVerbosity = config.models[model.id];
    if (sharedVerbosity) {
        return { key: model.id, verbosity: sharedVerbosity };
    }

    return {};
}

export function cycleVerbosity(current: Verbosity | undefined): Verbosity {
    switch (current) {
        case "low":
            return "medium";
        case "medium":
            return "high";
        case "high":
            return "low";
        default:
            return "low";
    }
}

export function setModelVerbosity(config: VerbosityConfig, key: string, verbosity: Verbosity): VerbosityConfig {
    return {
        models: {
            ...config.models,
            [key]: verbosity,
        },
    };
}

export function patchPayloadVerbosity(payload: unknown, verbosity: Verbosity): unknown {
    if (!isObject(payload)) {
        return payload;
    }

    const text = isObject(payload.text) ? payload.text : {};

    return {
        ...payload,
        text: {
            ...text,
            verbosity,
        },
    };
}

export function getVerbosityStatusText(
    config: VerbosityConfig,
    model: Pick<Model<Api>, "api" | "provider" | "id"> | undefined,
): string | undefined {
    if (!model || !supportsVerbosityControl(model)) {
        return undefined;
    }

    const { verbosity } = resolveConfiguredVerbosity(config, model);
    if (!verbosity) {
        return undefined;
    }

    return `${STATUS_LABEL} ${verbosity}`;
}

function syncVerbosityStatus(
    ctx: StatusContext,
    config: VerbosityConfig,
    model: Pick<Model<Api>, "api" | "provider" | "id"> | undefined = ctx.model,
): void {
    if (!ctx.hasUI) {
        return;
    }

    ctx.ui.setStatus(STATUS_KEY, getVerbosityStatusText(config, model));
}

function getShortcut(): KeyId {
    return process.platform === "darwin" ? (MACOS_SHORTCUT as KeyId) : (OTHER_SHORTCUT as KeyId);
}

export default function piVerbosityControlExtension(pi: ExtensionAPI): void {
    let activeConfig: VerbosityConfig = { ...DEFAULT_CONFIG };

    async function applyVerbosity(ctx: StatusContext, targetVerbosity: Verbosity): Promise<void> {
        const model = ctx.model!;
        const resolved = resolveConfiguredVerbosity(activeConfig, model);
        const configKey = resolved.key ?? getExactModelKey(model);

        activeConfig = setModelVerbosity(activeConfig, configKey, targetVerbosity);

        try {
            await saveConfig(activeConfig);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (ctx.hasUI) {
                ctx.ui.notify(`Failed to save verbosity config: ${message}`, "error");
            }
            return;
        }

        syncVerbosityStatus(ctx, activeConfig, model);

        if (ctx.hasUI) {
            ctx.ui.notify(`Verbosity for ${configKey} → ${targetVerbosity}`, "info");
        }
    }

    function validateModel(ctx: StatusContext): boolean {
        const model = ctx.model;
        if (!model) {
            if (ctx.hasUI) {
                ctx.ui.notify("No active model.", "warning");
            }
            return false;
        }

        if (!supportsVerbosityControl(model)) {
            if (ctx.hasUI) {
                ctx.ui.notify(`Verbosity control is not supported for ${model.provider}/${model.id}.`, "warning");
            }
            return false;
        }

        return true;
    }

    pi.registerCommand("verbosity", {
        description: "Set or cycle response verbosity for the current model (low | medium | high)",
        getArgumentCompletions: (prefix: string) => {
            const levels: Verbosity[] = ["low", "medium", "high"];
            const items = levels.map((v) => ({ value: v, label: v }));
            const filtered = items.filter((i) => i.value.startsWith(prefix));
            return filtered.length > 0 ? filtered : null;
        },
        handler: async (args, ctx) => {
            if (!validateModel(ctx)) return;

            const arg = args?.trim();
            let nextVerbosity: Verbosity;

            if (arg === "low" || arg === "medium" || arg === "high") {
                nextVerbosity = arg;
            } else if (!arg) {
                const resolved = resolveConfiguredVerbosity(activeConfig, ctx.model!);
                nextVerbosity = cycleVerbosity(resolved.verbosity);
            } else {
                if (ctx.hasUI) {
                    ctx.ui.notify(`Unknown verbosity "${arg}". Use: low, medium, high`, "error");
                }
                return;
            }

            await applyVerbosity(ctx, nextVerbosity);
        },
    });

    pi.registerShortcut(getShortcut(), {
        description: "Cycle response verbosity for the current model",
        handler: async (ctx) => {
            if (!validateModel(ctx)) return;
            const resolved = resolveConfiguredVerbosity(activeConfig, ctx.model!);
            await applyVerbosity(ctx, cycleVerbosity(resolved.verbosity));
        },
    });

    pi.on("session_start", async (_event, ctx) => {
        activeConfig = await loadConfig();
        syncVerbosityStatus(ctx, activeConfig);
    });

    pi.on("model_select", async (event, ctx) => {
        syncVerbosityStatus(ctx, activeConfig, event.model);
    });

    pi.on("session_shutdown", async (_event, ctx) => {
        if (ctx.hasUI) {
            ctx.ui.setStatus(STATUS_KEY, undefined);
        }
    });

    pi.on("before_provider_request", (event, ctx) => {
        const model = ctx.model;
        if (!model || !supportsVerbosityControl(model)) {
            return undefined;
        }

        const { verbosity } = resolveConfiguredVerbosity(activeConfig, model);
        if (!verbosity) {
            return undefined;
        }

        return patchPayloadVerbosity(event.payload, verbosity);
    });
}
