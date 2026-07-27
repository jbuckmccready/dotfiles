import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";

export type FastModeConfig = {
    enabled: boolean;
};

type JsonObject = Record<string, unknown>;

type SupportedFastModeApi = "openai-responses" | "openai-codex-responses";

type StatusContext = {
    hasUI: boolean;
    model?: Model<Api>;
    ui: Pick<ExtensionUIContext, "setStatus" | "notify">;
};

const DEFAULT_CONFIG: FastModeConfig = {
    enabled: false,
};

const STATUS_KEY = "fast-mode";
const STATUS_TEXT = "⚡ fast";
const FAST_MODE_SHORTCUT = "alt+shift+f" as KeyId;
const SUPPORTED_APIS = new Set<SupportedFastModeApi>(["openai-responses", "openai-codex-responses"]);

export function getGlobalConfigPath(): string {
    return path.join(os.homedir(), ".pi", "agent", "fast-mode.json");
}

function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseConfig(value: unknown): FastModeConfig {
    if (!isObject(value) || typeof value.enabled !== "boolean") {
        return { ...DEFAULT_CONFIG };
    }

    return { enabled: value.enabled };
}

export async function loadConfig(configPath = getGlobalConfigPath()): Promise<FastModeConfig> {
    try {
        const raw = await readFile(configPath, "utf8");
        return parseConfig(JSON.parse(raw) as unknown);
    } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "ENOENT") {
            return { ...DEFAULT_CONFIG };
        }

        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[pi-openai-fast-mode] Failed to read ${configPath}: ${message}`);
        return { ...DEFAULT_CONFIG };
    }
}

export async function saveConfig(config: FastModeConfig, configPath = getGlobalConfigPath()): Promise<void> {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 4)}\n`, "utf8");
}

export function supportsFastMode(model: Pick<Model<Api>, "api"> | undefined): boolean {
    return model !== undefined && SUPPORTED_APIS.has(model.api as SupportedFastModeApi);
}

export function resolveFastModeCommand(args: string | undefined, currentEnabled: boolean): boolean | undefined {
    const normalized = args?.trim().toLowerCase() ?? "";

    if (!normalized) {
        return !currentEnabled;
    }
    if (normalized === "on") {
        return true;
    }
    if (normalized === "off") {
        return false;
    }

    return undefined;
}

export function patchFastModePayload(payload: unknown): unknown {
    if (!isObject(payload)) {
        return payload;
    }

    return {
        ...payload,
        service_tier: "priority",
    };
}

export function getFastModeStatusText(
    config: FastModeConfig,
    model: Pick<Model<Api>, "api"> | undefined,
): string | undefined {
    return config.enabled && supportsFastMode(model) ? STATUS_TEXT : undefined;
}

function syncFastModeStatus(
    ctx: StatusContext,
    config: FastModeConfig,
    model: Pick<Model<Api>, "api"> | undefined = ctx.model,
): void {
    if (!ctx.hasUI) {
        return;
    }

    ctx.ui.setStatus(STATUS_KEY, getFastModeStatusText(config, model));
}

export default function piOpenAIFastModeExtension(pi: ExtensionAPI): void {
    let activeConfig: FastModeConfig = { ...DEFAULT_CONFIG };

    async function applyFastMode(ctx: StatusContext, enabled: boolean): Promise<void> {
        const nextConfig = { enabled };

        try {
            await saveConfig(nextConfig);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (ctx.hasUI) {
                ctx.ui.notify(`Failed to save Fast Mode config: ${message}`, "error");
            }
            return;
        }

        activeConfig = nextConfig;
        syncFastModeStatus(ctx, activeConfig);

        if (ctx.hasUI) {
            ctx.ui.notify(`Fast Mode → ${enabled ? "on" : "off"}`, "info");
        }
    }

    pi.registerCommand("fast", {
        description: "Toggle OpenAI Fast Mode. Usage: /fast [on|off]",
        getArgumentCompletions: (prefix: string) => {
            const items = ["on", "off"]
                .filter((value) => value.startsWith(prefix.trim().toLowerCase()))
                .map((value) => ({ value, label: value }));
            return items.length > 0 ? items : null;
        },
        handler: async (args, ctx) => {
            const enabled = resolveFastModeCommand(args, activeConfig.enabled);
            if (enabled === undefined) {
                if (ctx.hasUI) {
                    ctx.ui.notify(`Unknown Fast Mode setting "${args.trim()}". Use: on, off`, "error");
                }
                return;
            }

            await applyFastMode(ctx, enabled);
        },
    });

    pi.registerShortcut(FAST_MODE_SHORTCUT, {
        description: "Toggle OpenAI Fast Mode",
        handler: async (ctx) => {
            await applyFastMode(ctx, !activeConfig.enabled);
        },
    });

    pi.on("session_start", async (_event, ctx) => {
        activeConfig = await loadConfig();
        syncFastModeStatus(ctx, activeConfig);
    });

    pi.on("model_select", async (event, ctx) => {
        syncFastModeStatus(ctx, activeConfig, event.model);
    });

    pi.on("session_shutdown", async (_event, ctx) => {
        if (ctx.hasUI) {
            ctx.ui.setStatus(STATUS_KEY, undefined);
        }
    });

    pi.on("before_provider_request", (event, ctx) => {
        if (!activeConfig.enabled || !supportsFastMode(ctx.model)) {
            return undefined;
        }

        return patchFastModePayload(event.payload);
    });
}
