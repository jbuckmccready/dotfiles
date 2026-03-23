/**
 * Subagent process runner.
 *
 * Spawns isolated `pi` processes and streams results back via callbacks.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import type { AgentConfig } from "./agents";
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
const SUBAGENT_STACK_ENV = "PI_SUBAGENT_STACK";
const SUBAGENT_PREVENT_CYCLES_ENV = "PI_SUBAGENT_PREVENT_CYCLES";
const PI_OFFLINE_ENV = "PI_OFFLINE";
const MAX_RECOVERABLE_RETRIES = 1;

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

type SessionRunConfig =
  | { kind: "sessionDir"; path: string; continueSession: boolean }
  | { kind: "sessionFile"; path: string };

interface RunAttemptOptions {
  cwd: string;
  agent: AgentConfig;
  agentName: string;
  task: string;
  prompt: string;
  systemPromptPath: string | null;
  parentDepth: number;
  parentAgentStack: string[];
  maxDepth: number;
  preventCycles: boolean;
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
  if (!result.streamParseErrors) result.streamParseErrors = [];
  result.streamParseErrors.push(entry);
}

// ---------------------------------------------------------------------------
// Temp file helpers
// ---------------------------------------------------------------------------

function writeTempFile(
  agentName: string,
  prefix: string,
  suffix: string,
  contents: string,
): TempFileRef {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-"));
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `${prefix}${safeName}${suffix}`);
  fs.writeFileSync(filePath, contents, { encoding: "utf-8", mode: 0o600 });
  return { dir: tmpDir, filePath };
}

function createTempSessionDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-session-"));
}

function prepareSessionResources(
  delegationMode: DelegationMode,
  agentName: string,
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
    agentName,
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
    /* ignore */
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
    const msg = event.message as Message;
    result.messages.push(msg);

    if (msg.role === "assistant") {
      result.usage.turns++;
      if (Array.isArray(msg.content)) {
        result.usage.toolCalls += msg.content.filter(
          (part) => part.type === "toolCall",
        ).length;
      }
      const usage = msg.usage;
      if (usage) {
        result.usage.input += usage.input || 0;
        result.usage.output += usage.output || 0;
        result.usage.cacheRead += usage.cacheRead || 0;
        result.usage.cacheWrite += usage.cacheWrite || 0;
        result.usage.cost += usage.cost?.total || 0;
        result.usage.contextTokens = usage.totalTokens || 0;
      }
      if (!result.model && msg.model) result.model = msg.model;
      if (msg.stopReason) result.stopReason = msg.stopReason;
      if (msg.errorMessage) result.errorMessage = msg.errorMessage;
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

function buildPiArgs(
  agent: AgentConfig,
  systemPromptPath: string | null,
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

  if (agent.model) args.push("--model", agent.model);
  if (agent.thinking) args.push("--thinking", agent.thinking);
  if (agent.tools && agent.tools.length > 0) {
    args.push("--tools", agent.tools.join(","));
  }
  if (systemPromptPath) args.push("--append-system-prompt", systemPromptPath);
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
    agent,
    agentName,
    task,
    prompt,
    systemPromptPath,
    parentDepth,
    parentAgentStack,
    maxDepth,
    preventCycles,
    sessionConfig,
    signal,
    onUpdate,
  } = opts;

  const result: SingleResult = {
    agent: agentName,
    agentSource: agent.source,
    task,
    exitCode: -1,
    messages: [],
    stderr: "",
    usage: emptyUsage(),
    model: agent.model,
  };

  const emitUpdate = () => {
    onUpdate?.(result);
  };

  const piArgs = buildPiArgs(agent, systemPromptPath, prompt, sessionConfig);
  let wasAborted = false;

  const exitCode = await new Promise<number>((resolve) => {
    const nextDepth = Math.max(0, Math.floor(parentDepth)) + 1;
    const propagatedMaxDepth = Math.max(0, Math.floor(maxDepth));
    const propagatedStack = [...parentAgentStack, agentName];
    const proc = spawn("pi", piArgs, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        [SUBAGENT_DEPTH_ENV]: String(nextDepth),
        [SUBAGENT_MAX_DEPTH_ENV]: String(propagatedMaxDepth),
        [SUBAGENT_STACK_ENV]: JSON.stringify(propagatedStack),
        [SUBAGENT_PREVENT_CYCLES_ENV]: preventCycles ? "1" : "0",
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
  /** All available agent configs. */
  agents: AgentConfig[];
  /** Name of the agent to run. */
  agentName: string;
  /** Task description. */
  task: string;
  /** Context mode: spawn (fresh) or fork (session snapshot + task). */
  delegationMode: DelegationMode;
  /** Serialized parent session snapshot used when delegationMode is "fork". */
  forkSessionSnapshotJsonl?: string;
  /** Current delegation depth of the caller process. */
  parentDepth: number;
  /** Delegation stack from the caller process (ancestor agent names). */
  parentAgentStack: string[];
  /** Maximum allowed delegation depth to propagate to child processes. */
  maxDepth: number;
  /** Whether cycle prevention should be enforced in child processes. */
  preventCycles: boolean;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
  /** Streaming update callback. */
  onUpdate?: OnUpdateCallback;
  /** Factory to wrap results into SubagentDetails. */
  makeDetails: (results: SingleResult[]) => SubagentDetails;
}

/**
 * Spawn a single subagent process and collect its results.
 *
 * Returns a SingleResult even on failure (exitCode > 0, stderr populated).
 */
export async function runAgent(opts: RunAgentOptions): Promise<SingleResult> {
  const {
    cwd,
    agents,
    agentName,
    task,
    delegationMode,
    forkSessionSnapshotJsonl,
    parentDepth,
    parentAgentStack,
    maxDepth,
    preventCycles,
    signal,
    onUpdate,
    makeDetails,
  } = opts;

  const agent = agents.find((a) => a.name === agentName);
  if (!agent) {
    const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
    return {
      agent: agentName,
      agentSource: "unknown",
      task,
      exitCode: 1,
      messages: [],
      stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
      usage: emptyUsage(),
    };
  }

  if (
    delegationMode === "fork" &&
    (!forkSessionSnapshotJsonl || !forkSessionSnapshotJsonl.trim())
  ) {
    return {
      agent: agentName,
      agentSource: agent.source,
      task,
      exitCode: 1,
      messages: [],
      stderr:
        "Cannot run in fork mode: missing parent session snapshot context.",
      usage: emptyUsage(),
      model: agent.model,
      stopReason: "error",
      errorMessage:
        "Cannot run in fork mode: missing parent session snapshot context.",
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
      details: makeDetails([result]),
    });
  };

  const promptTempFile = agent.systemPrompt.trim()
    ? writeTempFile(agent.name, "prompt-", ".md", agent.systemPrompt)
    : null;
  const sessionResources = prepareSessionResources(
    delegationMode,
    agent.name,
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
        agent: agentName,
        agentSource: agent.source,
        task,
        exitCode: running ? -1 : lastAttempt?.exitCode ?? -1,
        messages: allAttempts.flatMap((attempt) => attempt.messages),
        stderr: running ? "" : lastAttempt?.stderr ?? "",
        usage: aggregateUsage(allAttempts),
        model: lastAttempt?.model ?? agent.model,
      };

      if (streamParseErrors.length > 0) {
        merged.streamParseErrors = streamParseErrors;
      }
      if (!running && lastAttempt?.stopReason) merged.stopReason = lastAttempt.stopReason;
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
        agent,
        agentName,
        task,
        prompt,
        systemPromptPath: promptTempFile?.filePath ?? null,
        parentDepth,
        parentAgentStack,
        maxDepth,
        preventCycles,
        sessionConfig: sessionResources.buildConfig(attemptIndex),
        signal,
        onUpdate: (partial) => emitMergedUpdate(partial),
      });

      const recoverableError = getRecoverableToolCallError(attemptResult);
      const shouldRetry =
        recoverableError !== null && attemptIndex < MAX_RECOVERABLE_RETRIES;

      completedAttempts.push(attemptResult);

      if (!shouldRetry) {
        return mergeAttempts();
      }

      recoveryTriggerError = recoverableError;
      prompt = buildRecoveryPrompt(recoverableError);
      emitMergedUpdate(undefined, true);
    }

    return mergeAttempts();
  } finally {
    cleanupTempDir(promptTempFile?.dir ?? null);
    cleanupTempDir(sessionResources.cleanupDir);
  }
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

/**
 * Map over items with a bounded number of concurrent workers.
 */
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
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
