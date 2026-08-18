/**
 * Pi Subagent Extension
 *
 * Delegates one task or a bounded set of parallel tasks to isolated `pi`
 * processes. Each child inherits the caller's provider, model, thinking level,
 * and active tools. Child processes cannot delegate further.
 */

import type {
  AgentToolUpdateCallback,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { renderCall, renderResult, setViewMode } from "./render";
import type { ToolViewMode } from "../tools/tool-view-mode";
import { mapConcurrent, runAgent } from "./runner";
import {
  type DelegationMode,
  type SingleResult,
  type SubagentDetails,
  DEFAULT_DELEGATION_MODE,
  emptyUsage,
  getFinalOutput,
  getRecoveryStatusText,
  getResultErrorText,
  isResultError,
} from "./types";

const DEFAULT_MAX_DELEGATION_DEPTH = 3;
const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;
const PARALLEL_HEARTBEAT_MS = 1000;
const SUBAGENT_DEPTH_ENV = "PI_SUBAGENT_DEPTH";
const SUBAGENT_MAX_DEPTH_ENV = "PI_SUBAGENT_MAX_DEPTH";

const TaskItem = Type.Object({
  task: Type.String({
    description: "Self-contained task for one isolated subagent to complete.",
  }),
});

const SubagentParams = Type.Object({
  task: Type.Optional(
    Type.String({
      description: "Task for single mode. Do not set this with tasks.",
    }),
  ),
  tasks: Type.Optional(
    Type.Array(TaskItem, {
      description:
        "Tasks for parallel mode. Each task runs in its own isolated subagent. Do not set task with this.",
      minItems: 1,
      maxItems: MAX_PARALLEL_TASKS,
    }),
  ),
  mode: Type.Optional(
    Type.String({
      description:
        "Context mode: 'spawn' (default) starts a fresh session; 'fork' includes a snapshot of the current session.",
      default: DEFAULT_DELEGATION_MODE,
    }),
  ),
});

interface DelegationDepthConfig {
  currentDepth: number;
  maxDepth: number;
  canDelegate: boolean;
}

interface SessionSnapshotSource {
  getHeader: () => unknown;
  getBranch: () => unknown[];
}

function parseDelegationMode(raw: unknown): DelegationMode | null {
  if (raw === undefined) return DEFAULT_DELEGATION_MODE;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  return normalized === "spawn" || normalized === "fork" ? normalized : null;
}

function buildForkSessionSnapshotJsonl(
  sessionManager: SessionSnapshotSource,
): string | null {
  const header = sessionManager.getHeader();
  if (!header || typeof header !== "object") return null;

  const branchEntries = sessionManager.getBranch();
  const lines = [JSON.stringify(header)];
  for (const entry of branchEntries) lines.push(JSON.stringify(entry));
  return `${lines.join("\n")}\n`;
}

function parseNonNegativeInt(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function getMaxDepthFlagFromArgv(argv: string[]): string | null {
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--subagent-max-depth") return argv[i + 1] ?? "";
    if (arg.startsWith("--subagent-max-depth=")) {
      return arg.slice("--subagent-max-depth=".length);
    }
  }
  return null;
}

function resolveDelegationDepthConfig(pi: ExtensionAPI): DelegationDepthConfig {
  const depthRaw = process.env[SUBAGENT_DEPTH_ENV];
  const parsedDepth = parseNonNegativeInt(depthRaw);
  if (depthRaw !== undefined && parsedDepth === null) {
    console.warn(
      `[pi-subagent] Ignoring invalid ${SUBAGENT_DEPTH_ENV}="${depthRaw}". Expected a non-negative integer.`,
    );
  }

  const envMaxDepthRaw = process.env[SUBAGENT_MAX_DEPTH_ENV];
  const envMaxDepth = parseNonNegativeInt(envMaxDepthRaw);
  if (envMaxDepthRaw !== undefined && envMaxDepth === null) {
    console.warn(
      `[pi-subagent] Ignoring invalid ${SUBAGENT_MAX_DEPTH_ENV}="${envMaxDepthRaw}". Expected a non-negative integer.`,
    );
  }

  const argvFlagRaw = getMaxDepthFlagFromArgv(process.argv);
  const argvFlagMaxDepth =
    argvFlagRaw !== null ? parseNonNegativeInt(argvFlagRaw) : null;
  if (argvFlagRaw !== null && argvFlagMaxDepth === null) {
    console.warn(
      `[pi-subagent] Ignoring invalid --subagent-max-depth value "${argvFlagRaw}". Expected a non-negative integer.`,
    );
  }

  const runtimeFlagValue = pi.getFlag("subagent-max-depth");
  const runtimeFlagMaxDepth =
    typeof runtimeFlagValue === "string"
      ? parseNonNegativeInt(runtimeFlagValue)
      : null;
  if (
    argvFlagRaw === null &&
    typeof runtimeFlagValue === "string" &&
    runtimeFlagMaxDepth === null
  ) {
    console.warn(
      `[pi-subagent] Ignoring invalid --subagent-max-depth value "${runtimeFlagValue}". Expected a non-negative integer.`,
    );
  }

  const currentDepth = parsedDepth ?? 0;
  const maxDepth =
    argvFlagMaxDepth ?? runtimeFlagMaxDepth ?? envMaxDepth ?? DEFAULT_MAX_DELEGATION_DEPTH;
  return { currentDepth, maxDepth, canDelegate: currentDepth < maxDepth };
}

function makeDetails(
  mode: "single" | "parallel",
  delegationMode: DelegationMode,
  results: SingleResult[],
): SubagentDetails {
  return { mode, delegationMode, results };
}

function getErrorResult(
  mode: "single" | "parallel",
  delegationMode: DelegationMode,
  text: string,
): {
  content: Array<{ type: "text"; text: string }>;
  details: SubagentDetails;
  isError: true;
} {
  return {
    content: [{ type: "text", text }],
    details: makeDetails(mode, delegationMode, []),
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // Sync tool view mode from the tools extension via shared event bus.
  pi.events.on("tool-view-mode", (mode: unknown) => {
    setViewMode(mode as ToolViewMode);
  });

  pi.registerFlag("subagent-max-depth", {
    description: "Maximum allowed subagent delegation depth (default: 3).",
    type: "string",
  });

  const depthConfig = resolveDelegationDepthConfig(pi);
  if (!depthConfig.canDelegate) return;

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description:
      "Delegate work to isolated pi processes. Use task for one subagent or tasks for up to 8 parallel subagents. Each child inherits the current provider, model, thinking level, and active tools. Nested delegation calls are rejected. Use mode='fork' when they need the current session context; use the default 'spawn' mode for fresh sessions.",
    parameters: SubagentParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const delegationMode = parseDelegationMode(params.mode);
      const model = ctx.model;
      const modelId = model?.id;
      const mode = params.tasks !== undefined ? "parallel" : "single";

      if (!delegationMode) {
        return getErrorResult(
          mode,
          DEFAULT_DELEGATION_MODE,
          `Invalid mode "${String(params.mode)}". Expected "spawn" or "fork".`,
        );
      }

      if (depthConfig.currentDepth > 0) {
        return getErrorResult(
          mode,
          delegationMode,
          "Nested subagent delegation is disabled.",
        );
      }

      const hasTask = params.task !== undefined;
      const hasTasks = params.tasks !== undefined;
      if (
        hasTask === hasTasks ||
        (params.tasks !== undefined && params.tasks.length === 0)
      ) {
        return getErrorResult(
          mode,
          delegationMode,
          "Invalid parameters. Provide exactly one invocation shape: task for single mode, or a non-empty tasks array for parallel mode.",
        );
      }

      if (params.tasks && params.tasks.length > MAX_PARALLEL_TASKS) {
        return getErrorResult(
          "parallel",
          delegationMode,
          `Too many parallel tasks (${params.tasks.length}). Max is ${MAX_PARALLEL_TASKS}.`,
        );
      }

      let forkSessionSnapshotJsonl: string | undefined;
      if (delegationMode === "fork") {
        forkSessionSnapshotJsonl =
          buildForkSessionSnapshotJsonl(ctx.sessionManager) ?? undefined;
        if (!forkSessionSnapshotJsonl) {
          return getErrorResult(
            mode,
            delegationMode,
            "Cannot use mode=\"fork\": failed to snapshot current session context.",
          );
        }
      }

      const tools = pi.getActiveTools();
      const runTask = (
        task: string,
        taskMode: "single" | "parallel",
        taskOnUpdate: AgentToolUpdateCallback<SubagentDetails> | undefined,
      ) =>
        runAgent({
          cwd: ctx.cwd,
          task,
          delegationMode,
          provider: model?.provider,
          model: modelId,
          thinkingLevel: ctx.thinkingLevel,
          tools,
          forkSessionSnapshotJsonl,
          parentDepth: depthConfig.currentDepth,
          maxDepth: depthConfig.maxDepth,
          signal,
          onUpdate: taskOnUpdate,
          makeDetails: (partial) =>
            makeDetails(taskMode, delegationMode, [partial]),
        });

      if (params.task !== undefined) {
        const result = await runTask(params.task, "single", onUpdate);

        if (isResultError(result)) {
          const errorMsg = getResultErrorText(result) || "(no output)";
          const recoveryStatus = getRecoveryStatusText(result);
          return {
            content: [
              {
                type: "text" as const,
                text: `${recoveryStatus ? `${recoveryStatus}\n\n` : ""}Subagent ${result.stopReason || "failed"}: ${errorMsg}`,
              },
            ],
            details: makeDetails("single", delegationMode, [result]),
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: [
                getRecoveryStatusText(result),
                getFinalOutput(result.messages) || "(no output)",
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
          ],
          details: makeDetails("single", delegationMode, [result]),
        };
      }

      const tasks = params.tasks!;
      const allResults: SingleResult[] = tasks.map(({ task }) => ({
        task,
        exitCode: -1,
        messages: [],
        stderr: "",
        usage: emptyUsage(),
        model: modelId,
      }));

      const emitProgress = () => {
        if (!onUpdate) return;
        const done = allResults.filter((result) => result.exitCode !== -1).length;
        onUpdate({
          content: [
            {
              type: "text",
              text: `Parallel: ${done}/${allResults.length} done, ${allResults.length - done} running...`,
            },
          ],
          details: makeDetails("parallel", delegationMode, [...allResults]),
        });
      };

      emitProgress();
      const heartbeat = onUpdate
        ? setInterval(() => {
            if (allResults.some((result) => result.exitCode === -1)) {
              emitProgress();
            }
          }, PARALLEL_HEARTBEAT_MS)
        : undefined;

      let results: SingleResult[];
      try {
        results = await mapConcurrent(
          tasks,
          MAX_CONCURRENCY,
          async ({ task }, index) => {
            if (signal?.aborted) {
              const result: SingleResult = {
                task,
                exitCode: 130,
                messages: [],
                stderr: "Subagent was aborted before it started.",
                usage: emptyUsage(),
                model: modelId,
                stopReason: "aborted",
                errorMessage: "Subagent was aborted before it started.",
              };
              allResults[index] = result;
              emitProgress();
              return result;
            }

            const result = await runTask(task, "parallel", (partial) => {
              const partialResult = partial.details?.results[0];
              if (partialResult) {
                allResults[index] = partialResult;
                emitProgress();
              }
            });
            allResults[index] = result;
            emitProgress();
            return result;
          },
        );
      } finally {
        if (heartbeat) clearInterval(heartbeat);
      }

      const successCount = results.filter(
        (result) => !isResultError(result),
      ).length;
      const summaries = results.map((result, index) => {
        const success = !isResultError(result);
        const output = success
          ? getFinalOutput(result.messages)
          : getResultErrorText(result);
        return [
          `[Task ${index + 1}] ${success ? "completed" : "failed"}: ${output || "(no output)"}`,
          getRecoveryStatusText(result),
        ]
          .filter(Boolean)
          .join("\n");
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join("\n\n")}`,
          },
        ],
        details: makeDetails("parallel", delegationMode, results),
      };
    },

    renderCall: (args, theme, context) => renderCall(args, theme, context),
    renderResult: (result, state, theme, context) =>
      renderResult(result, state, theme, context),
  });
}
