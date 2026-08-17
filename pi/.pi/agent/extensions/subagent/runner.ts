/**
 * Subagent process runner.
 *
 * Spawns an isolated `pi` process using the caller's provider, model, and
 * thinking level, and active tools, then streams results back via callbacks.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import {
  type DelegationMode,
  type SingleResult,
  type StreamParseError,
  type SubagentDetails,
  aggregateUsage,
  emptyUsage,
  getFinalOutput,
} from "./types";

const SIGKILL_TIMEOUT_MS = 5000;
const SUBAGENT_DEPTH_ENV = "PI_SUBAGENT_DEPTH";
const SUBAGENT_MAX_DEPTH_ENV = "PI_SUBAGENT_MAX_DEPTH";
const PI_OFFLINE_ENV = "PI_OFFLINE";
const MAX_RECOVERABLE_RETRIES = 1;

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

type SessionRunConfig =
  | { kind: "sessionDir"; path: string; continueSession: boolean }
  | { kind: "sessionFile"; path: string };

interface RunAttemptOptions {
  cwd: string;
  task: string;
  prompt: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  tools: string[];
  parentDepth: number;
  maxDepth: number;
  sessionConfig: SessionRunConfig;
  signal?: AbortSignal;
  onUpdate?: (result: SingleResult) => void;
}

interface TempFileRef {
  dir: string;
  filePath: string;
}

interface PreparedSessionResources {
  cleanupDir: string | null;
  buildConfig: (attemptIndex: number) => SessionRunConfig;
}

type StreamEvent = {
  type?: string;
  message?: unknown;
};

function formatLinePreview(line: string, maxChars = 240): string {
  const normalized = line.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
}

function recordStreamParseError(
  result: SingleResult,
  error: unknown,
  line: string,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const entry: StreamParseError = {
    stream: "stdout",
    message,
    linePreview: formatLinePreview(line),
    lineLength: line.length,
  };
  result.streamParseErrors ??= [];
  result.streamParseErrors.push(entry);
}

// ---------------------------------------------------------------------------
// Temp file helpers
// ---------------------------------------------------------------------------

function writeTempFile(prefix: string, suffix: string, contents: string): TempFileRef {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-"));
  const filePath = path.join(dir, `${prefix}${suffix}`);
  fs.writeFileSync(filePath, contents, { encoding: "utf-8", mode: 0o600 });
  return { dir, filePath };
}

function createTempSessionDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-session-"));
}

function prepareSessionResources(
  delegationMode: DelegationMode,
  forkSessionSnapshotJsonl?: string,
): PreparedSessionResources {
  if (delegationMode === "spawn") {
    const sessionDir = createTempSessionDir();
    return {
      cleanupDir: sessionDir,
      buildConfig: (attemptIndex) => ({
        kind: "sessionDir",
        path: sessionDir,
        continueSession: attemptIndex > 0,
      }),
    };
  }

  const sessionFile = writeTempFile(
    "fork-",
    ".jsonl",
    forkSessionSnapshotJsonl ?? "",
  );
  return {
    cleanupDir: sessionFile.dir,
    buildConfig: () => ({ kind: "sessionFile", path: sessionFile.filePath }),
  };
}

function cleanupTempDir(dir: string | null): void {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup for temporary child session files.
  }
}

// ---------------------------------------------------------------------------
// JSON-line stream processing
// ---------------------------------------------------------------------------

function processJsonLine(line: string, result: SingleResult): boolean {
  if (!line.trim()) return false;

  let event: StreamEvent;
  try {
    event = JSON.parse(line) as StreamEvent;
  } catch (error) {
    recordStreamParseError(result, error, line);
    return false;
  }

  if (event.type === "message_end" && event.message) {
    const message = event.message as Message;
    result.messages.push(message);

    if (message.role === "assistant") {
      result.usage.turns++;
      if (Array.isArray(message.content)) {
        result.usage.toolCalls += message.content.filter(
          (part) => part.type === "toolCall",
        ).length;
      }
      const usage = message.usage;
      if (usage) {
        result.usage.input += usage.input || 0;
        result.usage.output += usage.output || 0;
        result.usage.cacheRead += usage.cacheRead || 0;
        result.usage.cacheWrite += usage.cacheWrite || 0;
        result.usage.cost += usage.cost?.total || 0;
        result.usage.contextTokens = usage.totalTokens || 0;
      }
      if (message.model) result.model = message.model;
      if (message.stopReason) result.stopReason = message.stopReason;
      if (message.errorMessage) result.errorMessage = message.errorMessage;
    }
    return true;
  }

  if (event.type === "tool_result_end" && event.message) {
    result.messages.push(event.message as Message);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Build pi CLI arguments
// ---------------------------------------------------------------------------

export function buildPiArgs(
  provider: string | undefined,
  model: string | undefined,
  thinkingLevel: string | undefined,
  tools: string[],
  prompt: string,
  sessionConfig: SessionRunConfig,
): string[] {
  const args: string[] = ["--mode", "json", "-p"];

  if (sessionConfig.kind === "sessionDir") {
    if (sessionConfig.continueSession) args.push("--continue");
    args.push("--session-dir", sessionConfig.path);
  } else {
    args.push("--session", sessionConfig.path);
  }

  if (provider) args.push("--provider", provider);
  if (model) args.push("--model", model);
  if (thinkingLevel) args.push("--thinking", thinkingLevel);
  args.push("--tools", tools.join(","));
  args.push(prompt);
  return args;
}

function buildRecoveryPrompt(errorMessage: string): string {
  return [
    "Your previous turn failed because your last tool call had invalid JSON arguments and could not be executed.",
    `Failure: ${errorMessage}`,
    "Continue from the current session state.",
    "Do not restart from scratch.",
    "Re-issue the intended tool call with valid JSON arguments, or choose another tool if that is better.",
  ].join("\n");
}

/** If the child failed due to malformed tool-call JSON, return the error message so the caller can retry. */
function getRecoverableToolCallError(result: SingleResult): string | null {
  if (result.stopReason !== "error") return null;
  if ((result.streamParseErrors?.length ?? 0) > 0) return null;

  const message = result.errorMessage?.trim();
  if (!message) return null;

  return /json/i.test(message) ? message : null;
}

async function runAttempt(opts: RunAttemptOptions): Promise<SingleResult> {
  const {
    cwd,
    task,
    prompt,
    provider,
    model,
    thinkingLevel,
    tools,
    parentDepth,
    maxDepth,
    sessionConfig,
    signal,
    onUpdate,
  } = opts;

  const result: SingleResult = {
    task,
    exitCode: -1,
    messages: [],
    stderr: "",
    usage: emptyUsage(),
    model,
  };

  const emitUpdate = () => onUpdate?.(result);
  const piArgs = buildPiArgs(
    provider,
    model,
    thinkingLevel,
    tools,
    prompt,
    sessionConfig,
  );
  let wasAborted = false;

  const exitCode = await new Promise<number>((resolve) => {
    const nextDepth = Math.max(0, Math.floor(parentDepth)) + 1;
    const propagatedMaxDepth = Math.max(0, Math.floor(maxDepth));
    const proc = spawn("pi", piArgs, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        [SUBAGENT_DEPTH_ENV]: String(nextDepth),
        [SUBAGENT_MAX_DEPTH_ENV]: String(propagatedMaxDepth),
        [PI_OFFLINE_ENV]: "1",
      },
    });

    let buffer = "";
    const flushLine = (line: string) => {
      if (processJsonLine(line, result)) emitUpdate();
    };

    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) flushLine(line);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      result.stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (buffer.trim()) flushLine(buffer);
      resolve(code ?? 0);
    });

    proc.on("error", (error) => {
      if (!result.stderr.trim()) {
        result.stderr = error instanceof Error ? error.message : String(error);
      }
      resolve(1);
    });

    if (signal) {
      const kill = () => {
        wasAborted = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, SIGKILL_TIMEOUT_MS);
      };
      if (signal.aborted) kill();
      else signal.addEventListener("abort", kill, { once: true });
    }
  });

  result.exitCode = exitCode;
  if (wasAborted) {
    result.exitCode = 130;
    result.stopReason = "aborted";
    result.errorMessage = "Subagent was aborted.";
    if (!result.stderr.trim()) result.stderr = "Subagent was aborted.";
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RunAgentOptions {
  /** Working directory for the child process. */
  cwd: string;
  /** Task description. */
  task: string;
  /** Context mode: spawn (fresh) or fork (session snapshot + task). */
  delegationMode: DelegationMode;
  /** Provider inherited from the caller's active model. */
  provider?: string;
  /** Model inherited from the caller's active model. */
  model?: string;
  /** Thinking level inherited from the caller. */
  thinkingLevel?: string;
  /** Active tool allowlist inherited from the caller. */
  tools: string[];
  /** Serialized parent session snapshot used when delegationMode is "fork". */
  forkSessionSnapshotJsonl?: string;
  /** Current delegation depth of the caller process. */
  parentDepth: number;
  /** Maximum allowed delegation depth to propagate to child processes. */
  maxDepth: number;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
  /** Streaming update callback. */
  onUpdate?: OnUpdateCallback;
  /** Factory to wrap results into SubagentDetails. */
  makeDetails: (result: SingleResult) => SubagentDetails;
}

/**
 * Spawn a single subagent process and collect its results.
 *
 * Returns a SingleResult even on failure (exitCode > 0, stderr populated).
 */
export async function runAgent(opts: RunAgentOptions): Promise<SingleResult> {
  const {
    cwd,
    task,
    delegationMode,
    provider,
    model,
    thinkingLevel,
    tools,
    forkSessionSnapshotJsonl,
    parentDepth,
    maxDepth,
    signal,
    onUpdate,
    makeDetails,
  } = opts;

  if (
    delegationMode === "fork" &&
    (!forkSessionSnapshotJsonl || !forkSessionSnapshotJsonl.trim())
  ) {
    return {
      task,
      exitCode: 1,
      messages: [],
      stderr: "Cannot run in fork mode: missing parent session snapshot context.",
      usage: emptyUsage(),
      model,
      stopReason: "error",
      errorMessage: "Cannot run in fork mode: missing parent session snapshot context.",
    };
  }

  const emitUpdate = (result: SingleResult) => {
    onUpdate?.({
      content: [
        {
          type: "text",
          text: getFinalOutput(result.messages) || "(running...)",
        },
      ],
      details: makeDetails(result),
    });
  };

  const sessionResources = prepareSessionResources(
    delegationMode,
    forkSessionSnapshotJsonl,
  );

  try {
    const completedAttempts: SingleResult[] = [];
    let recoveryTriggerError: string | undefined;

    const mergeAttempts = (
      currentAttempt?: SingleResult,
      running = false,
    ): SingleResult => {
      const allAttempts = currentAttempt
        ? [...completedAttempts, currentAttempt]
        : [...completedAttempts];
      const lastAttempt =
        currentAttempt ?? completedAttempts[completedAttempts.length - 1];
      const streamParseErrors = allAttempts.flatMap(
        (attempt) => attempt.streamParseErrors ?? [],
      );

      const merged: SingleResult = {
        task,
        exitCode: running ? -1 : lastAttempt?.exitCode ?? -1,
        messages: allAttempts.flatMap((attempt) => attempt.messages),
        stderr: running ? "" : lastAttempt?.stderr ?? "",
        usage: aggregateUsage(allAttempts),
        model: lastAttempt?.model ?? model,
      };

      if (streamParseErrors.length > 0) {
        merged.streamParseErrors = streamParseErrors;
      }
      if (!running && lastAttempt?.stopReason) {
        merged.stopReason = lastAttempt.stopReason;
      }
      if (!running && lastAttempt?.errorMessage) {
        merged.errorMessage = lastAttempt.errorMessage;
      }
      if (recoveryTriggerError) {
        merged.recoveryAttempts = running
          ? completedAttempts.length
          : Math.max(0, completedAttempts.length - 1);
        merged.recoveryTriggerError = recoveryTriggerError;
      }
      if (running) merged.recoveryInProgress = true;

      return merged;
    };

    const emitMergedUpdate = (
      currentAttempt?: SingleResult,
      running = false,
    ) => {
      emitUpdate(mergeAttempts(currentAttempt, running));
    };

    let prompt = `Task: ${task}`;

    for (
      let attemptIndex = 0;
      attemptIndex <= MAX_RECOVERABLE_RETRIES;
      attemptIndex++
    ) {
      const attemptResult = await runAttempt({
        cwd,
        task,
        prompt,
        provider,
        model,
        thinkingLevel,
        tools,
        parentDepth,
        maxDepth,
        sessionConfig: sessionResources.buildConfig(attemptIndex),
        signal,
        onUpdate: (partial) => emitMergedUpdate(partial),
      });

      const recoverableError = getRecoverableToolCallError(attemptResult);
      const shouldRetry =
        recoverableError !== null && attemptIndex < MAX_RECOVERABLE_RETRIES;

      completedAttempts.push(attemptResult);

      if (!shouldRetry) return mergeAttempts();

      recoveryTriggerError = recoverableError;
      prompt = buildRecoveryPrompt(recoverableError);
      emitMergedUpdate(undefined, true);
    }

    return mergeAttempts();
  } finally {
    cleanupTempDir(sessionResources.cleanupDir);
  }
}

/** Map over items with a bounded number of concurrent workers. */
export async function mapConcurrent<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
