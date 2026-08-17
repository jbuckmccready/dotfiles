/**
 * Shared type definitions for the subagent extension.
 */

import type { Message } from "@earendil-works/pi-ai";

export interface StreamParseError {
  stream: "stdout";
  message: string;
  linePreview: string;
  lineLength: number;
}

/** Context mode for delegated runs. */
export type DelegationMode = "spawn" | "fork";

/** Default context mode for delegated runs. */
export const DEFAULT_DELEGATION_MODE: DelegationMode = "spawn";

/** Aggregated token usage from a subagent run. */
export interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
  toolCalls: number;
}

/** Result of a subagent invocation. */
export interface SingleResult {
  task: string;
  exitCode: number;
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  streamParseErrors?: StreamParseError[];
  recoveryAttempts?: number;
  recoveryInProgress?: boolean;
  recoveryTriggerError?: string;
}

/** Metadata attached to every tool result for rendering. */
export interface SubagentDetails {
  mode: "single" | "parallel";
  delegationMode: DelegationMode;
  results: SingleResult[];
}

/** A display-friendly representation of a message part. */
export type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; args: Record<string, unknown> };

/** Create an empty UsageStats object. */
export function emptyUsage(): UsageStats {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    contextTokens: 0,
    turns: 0,
    toolCalls: 0,
  };
}

/** Sum additive usage and retain the latest context size across attempts. */
export function aggregateUsage(results: SingleResult[]): UsageStats {
  const total = emptyUsage();
  for (const result of results) {
    total.input += result.usage.input;
    total.output += result.usage.output;
    total.cacheRead += result.usage.cacheRead;
    total.cacheWrite += result.usage.cacheWrite;
    total.cost += result.usage.cost;
    total.contextTokens = result.usage.contextTokens;
    total.turns += result.usage.turns;
    total.toolCalls += result.usage.toolCalls;
  }
  return total;
}

/** Sum usage across independent parallel runs. */
export function sumUsage(results: SingleResult[]): UsageStats {
  const total = aggregateUsage(results);
  total.contextTokens = results.reduce(
    (sum, result) => sum + result.usage.contextTokens,
    0,
  );
  return total;
}

/** Whether a result represents an error. */
export function isResultError(result: SingleResult): boolean {
  return (
    result.exitCode > 0 ||
    result.stopReason === "error" ||
    result.stopReason === "aborted"
  );
}

/** Extract the last assistant text from a message history. */
export function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    for (const part of message.content) {
      if (part.type === "text") return part.text;
    }
  }
  return "";
}

function formatStreamParseError(error: StreamParseError, index: number): string {
  return [
    `Parent failed to parse child ${error.stream} JSONL line ${index + 1}: ${error.message}`,
    `Raw line preview (${error.lineLength} chars): ${error.linePreview}`,
  ].join("\n");
}

export function getResultErrorText(result: SingleResult): string {
  const parts: string[] = [];
  if (result.errorMessage) {
    parts.push(`Child agent error: ${result.errorMessage}`);
  }
  if (result.stderr.trim()) {
    parts.push(`Child stderr:\n${result.stderr.trim()}`);
  }
  if (result.streamParseErrors && result.streamParseErrors.length > 0) {
    parts.push(
      result.streamParseErrors
        .map((error, index) => formatStreamParseError(error, index))
        .join("\n\n"),
    );
  }
  if (parts.length > 0) return parts.join("\n\n");
  return getFinalOutput(result.messages);
}

export function getRecoveryStatusText(result: SingleResult): string | null {
  const attempts = result.recoveryAttempts ?? 0;
  if (attempts <= 0) return null;

  const suffix = result.recoveryTriggerError
    ? ` Trigger: ${result.recoveryTriggerError}`
    : "";
  if (result.recoveryInProgress) {
    return `Recovery retry ${attempts} in progress after malformed tool-call JSON.${suffix}`;
  }
  if (isResultError(result)) {
    return `Recovery retry failed after ${attempts} attempt${attempts === 1 ? "" : "s"}.${suffix}`;
  }
  return `Recovered after ${attempts} retr${attempts === 1 ? "y" : "ies"}.${suffix}`;
}

/** Extract all display-worthy items from a message history. */
export function getDisplayItems(messages: Message[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.content) {
      if (part.type === "text") {
        items.push({ type: "text", text: part.text });
      } else if (part.type === "toolCall") {
        items.push({ type: "toolCall", name: part.name, args: part.arguments });
      }
    }
  }
  return items;
}
