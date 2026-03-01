import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
    ExtensionAPI,
    ExtensionUIContext,
} from "@mariozechner/pi-coding-agent";
import type {
    BashOperations,
    ReadOperations,
    WriteOperations,
    EditOperations,
    GrepOperations,
    FindOperations,
    LsOperations,
} from "@mariozechner/pi-coding-agent";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

// --- Config ---

export interface OsSandboxConfig extends SandboxRuntimeConfig {
    type?: "os";
    enabled?: boolean;
    ignoreViolations?: Record<string, string[]>;
    enableWeakerNestedSandbox?: boolean;
    commandEnv?: Record<string, string>;
}

export interface GondolinSecretConfig {
    hosts: string[];
    fromEnv?: string;
}

export interface GondolinSandboxConfig {
    type: "gondolin";
    enabled?: boolean;
    guestDir?: string;
    allowedHosts?: string[];
    secrets?: Record<string, GondolinSecretConfig>;
    excludePaths?: string[];
}

export interface DisabledSandboxConfig {
    type: "disabled";
    enabled?: boolean;
}

export type SandboxConfig =
    | OsSandboxConfig
    | GondolinSandboxConfig
    | DisabledSandboxConfig;

export const DEFAULT_OS_CONFIG: OsSandboxConfig = {
    enabled: true,
    network: {
        allowedDomains: [
            "npmjs.org",
            "*.npmjs.org",
            "registry.npmjs.org",
            "registry.yarnpkg.com",
            "pypi.org",
            "*.pypi.org",
            "files.pythonhosted.org",
            "anthropic.com",
            "*.anthropic.com",
            "github.com",
            "*.github.com",
            "api.github.com",
            "raw.githubusercontent.com",
        ],
        allowUnixSockets: [
            ...(process.env.SSH_AUTH_SOCK ? [process.env.SSH_AUTH_SOCK] : []),
        ],
        // NOTE: this one is somewhat dangerous, when set to true, the domain name
        // restrictions can be bypassed by just unsetting proxy env vars (tested on MacOS)
        allowLocalBinding: false,
        deniedDomains: [],
    },
    filesystem: {
        denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"],
        allowWrite: [".", "/tmp", "/private/tmp", "~/.pi/sandbox-cache"],
        denyWrite: [".env", ".env.*", "*.pem", "*.key", ".pi/sandbox.json"],
    },
};

function mergeOsConfig(
    base: OsSandboxConfig,
    overrides: Partial<OsSandboxConfig>,
): OsSandboxConfig {
    const result: OsSandboxConfig = { ...base };
    if (overrides.enabled !== undefined) result.enabled = overrides.enabled;
    if (overrides.network) {
        result.network = { ...base.network, ...overrides.network };
    }
    if (overrides.filesystem) {
        result.filesystem = { ...base.filesystem, ...overrides.filesystem };
    }
    if (overrides.ignoreViolations) {
        result.ignoreViolations = overrides.ignoreViolations;
    }
    if (overrides.enableWeakerNestedSandbox !== undefined) {
        result.enableWeakerNestedSandbox = overrides.enableWeakerNestedSandbox;
    }
    if (overrides.commandEnv) {
        result.commandEnv = {
            ...(base.commandEnv ?? {}),
            ...overrides.commandEnv,
        };
    }
    return result;
}

function loadJson(path: string): Record<string, unknown> | null {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
}

export function loadConfig(cwd: string): SandboxConfig {
    const projectConfigPath = join(cwd, ".pi", "sandbox.json");
    const globalConfigPath = join(homedir(), ".pi", "agent", "sandbox.json");

    const globalRaw = loadJson(globalConfigPath) ?? {};
    const projectRaw = loadJson(projectConfigPath) ?? {};

    // Project overrides global; last `type` wins
    const merged = { ...globalRaw, ...projectRaw };

    // Deep-merge network/filesystem for OS configs
    if (globalRaw.network && projectRaw.network) {
        merged.network = {
            ...(globalRaw.network as any),
            ...(projectRaw.network as any),
        };
    }
    if (globalRaw.filesystem && projectRaw.filesystem) {
        merged.filesystem = {
            ...(globalRaw.filesystem as any),
            ...(projectRaw.filesystem as any),
        };
    }

    const type = merged.type as string | undefined;

    if (type === "disabled") {
        return {
            type: "disabled",
            enabled: merged.enabled as boolean | undefined,
        };
    }

    if (type === "gondolin") {
        return {
            type: "gondolin",
            enabled: merged.enabled as boolean | undefined,
            guestDir: merged.guestDir as string | undefined,
            allowedHosts: merged.allowedHosts as string[] | undefined,
            secrets: merged.secrets as
                | Record<string, GondolinSecretConfig>
                | undefined,
            excludePaths: merged.excludePaths as string[] | undefined,
        };
    }

    // Default: OS sandbox. Merge with defaults.
    return mergeOsConfig(DEFAULT_OS_CONFIG, merged as Partial<OsSandboxConfig>);
}

// --- Interfaces ---

export interface GrepExecuteResult {
    content: Array<{ type: "text"; text: string }>;
    details: Record<string, any> | undefined;
}

export interface SandboxOps {
    bash?: BashOperations;
    read?: ReadOperations;
    write?: WriteOperations;
    edit?: EditOperations;
    grep?: GrepOperations;
    find?: FindOperations;
    ls?: LsOperations;
    /** Full grep execute override (bypasses core tool's host-side rg) */
    grepExecute?: (
        params: any,
        signal?: AbortSignal,
    ) => Promise<GrepExecuteResult>;
}

export interface SandboxProvider<TConfig = SandboxConfig> {
    init(
        pi: ExtensionAPI,
        cwd: string,
        ui: ExtensionUIContext,
        config: TConfig,
    ): Promise<void>;
    shutdown(): Promise<void>;
    isActive(): boolean;
    getOps(): SandboxOps;
}

export interface SandboxAPI {
    isActive(): boolean;
    getOps(): SandboxOps;
}
