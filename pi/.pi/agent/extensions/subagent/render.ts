/**
 * TUI rendering for subagent tool calls and results.
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import {
  Markdown,
  type MarkdownTheme,
  type Component,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import {
  type DelegationMode,
  type DisplayItem,
  type SingleResult,
  type SubagentDetails,
  type UsageStats,
  DEFAULT_DELEGATION_MODE,
  getDisplayItems,
  getFinalOutput,
  getRecoveryStatusText,
  getResultErrorText,
  isResultError,
  sumUsage,
} from "./types";
import {
  component,
  getSanitizedTextOutput,
  replaceTabs,
  shortenPath,
} from "../tools/shared";
import type { ToolViewMode } from "../tools/tool-view-mode";

let currentViewMode: ToolViewMode = "minimal";

export function setViewMode(mode: ToolViewMode): void {
  currentViewMode = mode;
}

const COLLAPSED_LINE_COUNT = 10;
const COLLAPSED_PARALLEL_LINE_COUNT = 5;

type CompCache = Partial<Record<ToolViewMode, Component>>;
type ThemeFg = (color: ThemeColor, text: string) => string;
type Theme = {
  fg: ThemeFg;
  bold: (s: string) => string;
  italic?: (s: string) => string;
  underline?: (s: string) => string;
  strikethrough?: (s: string) => string;
  getFgAnsi?: (color: ThemeColor) => string;
};
type RenderState = { expanded: boolean; isPartial?: boolean };
type RowRenderState = { details?: SubagentDetails; complete?: boolean };
type SubagentRenderArgs = {
  task?: string;
  tasks?: Array<{ task?: string }>;
  mode?: unknown;
};

type RenderContext = {
  state: RowRenderState;
};

const resultCache = new WeakMap<object, CompCache>();

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

function formatUsage(usage: Partial<UsageStats>, model?: string): string {
  const parts: string[] = [];
  if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
  if (usage.toolCalls) {
    parts.push(`${usage.toolCalls} tool call${usage.toolCalls > 1 ? "s" : ""}`);
  }
  if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
  if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  if (usage.contextTokens && usage.contextTokens > 0) {
    parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
  }
  if (model) parts.push(model);
  return parts.join(" ");
}

function truncate(text: unknown, maxLen: number): string {
  const value = typeof text === "string" ? text : text == null ? "" : String(text);
  return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
}

/** Width-aware single-line truncation that returns plain text (no ANSI codes). */
function truncateLine(text: string, maxWidth: number): string {
  text = text.replace(/\s*[\r\n]+\s*/g, " ");
  if (maxWidth <= 0) return "";
  if (visibleWidth(text) <= maxWidth) return text;
  const target = maxWidth - 1;
  if (target <= 0) return "…";
  let end = text.length;
  while (end > 0 && visibleWidth(text.slice(0, end)) > target) end--;
  return `${text.slice(0, end)}…`;
}

function normalizeDelegationMode(raw: unknown): DelegationMode {
  return raw === "fork" ? "fork" : DEFAULT_DELEGATION_MODE;
}

function makeSep(theme: Theme, width: number): string {
  const borderAnsi = theme.getFgAnsi?.("borderMuted") ?? "";
  return `${borderAnsi}${"─".repeat(Math.max(1, width))}\x1b[39m`;
}

function wrapLines(text: string, width: number): string[] {
  const normalized = replaceTabs(text).replace(/\r\n?/g, "\n");
  const physicalLines = normalized.split("\n");
  const wrapped: string[] = [];
  for (const line of physicalLines) {
    const next = wrapTextWithAnsi(line, width);
    wrapped.push(...(next.length > 0 ? next : [""]));
  }
  if (wrapped.length > 1 && wrapped[wrapped.length - 1] === "") wrapped.pop();
  return wrapped;
}

function appendWrapped(lines: string[], text: string, width: number): void {
  lines.push(...wrapLines(text, width));
}

function getMarkdownThemeFor(theme: Theme): MarkdownTheme {
  return {
    heading: (text) => theme.fg("mdHeading", text),
    link: (text) => theme.fg("mdLink", text),
    linkUrl: (text) => theme.fg("mdLinkUrl", text),
    code: (text) => theme.fg("mdCode", text),
    codeBlock: (text) => theme.fg("mdCodeBlock", text),
    codeBlockBorder: (text) => theme.fg("mdCodeBlockBorder", text),
    quote: (text) => theme.fg("mdQuote", text),
    quoteBorder: (text) => theme.fg("mdQuoteBorder", text),
    hr: (text) => theme.fg("mdHr", text),
    listBullet: (text) => theme.fg("mdListBullet", text),
    bold: (text) => theme.bold(text),
    italic: (text) => (theme.italic ? theme.italic(text) : text),
    underline: (text) => (theme.underline ? theme.underline(text) : text),
    strikethrough: (text) =>
      theme.strikethrough ? theme.strikethrough(text) : text,
  };
}

function renderMarkdownLines(text: string, width: number, theme: Theme): string[] {
  return new Markdown(text, 0, 0, getMarkdownThemeFor(theme)).render(width);
}

function appendPreview(
  lines: string[],
  previewLines: string[],
  width: number,
  limit: number,
  hint: string,
): void {
  const shown = previewLines.slice(-limit);
  const skipped = previewLines.length - shown.length;
  if (skipped > 0) appendWrapped(lines, hint.replace("{count}", String(skipped)), width);
  lines.push(...shown);
}

function stripTrailingFinalOutputItem(
  items: DisplayItem[],
  finalOutput: string,
): DisplayItem[] {
  if (!finalOutput || items.length === 0) return items;
  const lastItem = items[items.length - 1];
  if (!lastItem || lastItem.type !== "text") return items;
  return lastItem.text.trim() === finalOutput ? items.slice(0, -1) : items;
}

function formatToolCall(
  toolName: string,
  args: Record<string, unknown>,
  fg: ThemeFg,
): string {
  const pathArg = (args.file_path || args.path || "...") as string;

  switch (toolName) {
    case "bash": {
      const command = (args.command as string) || "...";
      return fg("muted", "$ ") + fg("toolOutput", truncate(command, 120));
    }
    case "read": {
      let text = fg("accent", shortenPath(pathArg));
      const offset = args.offset as number | undefined;
      const limit = args.limit as number | undefined;
      if (offset !== undefined || limit !== undefined) {
        const start = offset ?? 1;
        const end = limit !== undefined ? start + limit - 1 : "";
        text += fg("warning", `:${start}${end ? `-${end}` : ""}`);
      }
      return fg("muted", "read ") + text;
    }
    case "write": {
      const lines = ((args.content || "") as string).split("\n").length;
      let text = fg("muted", "write ") + fg("accent", shortenPath(pathArg));
      if (lines > 1) text += fg("dim", ` (${lines} lines)`);
      return text;
    }
    case "edit":
      return fg("muted", "edit ") + fg("accent", shortenPath(pathArg));
    case "ls":
      return fg("muted", "ls ") + fg("accent", shortenPath((args.path || ".") as string));
    case "find":
      return (
        fg("muted", "find ") +
        fg("accent", (args.pattern || "*") as string) +
        fg("dim", ` in ${shortenPath((args.path || ".") as string)}`)
      );
    case "grep":
      return (
        fg("muted", "grep ") +
        fg("accent", `/${(args.pattern || "") as string}/`) +
        fg("dim", ` in ${shortenPath((args.path || ".") as string)}`)
      );
    default:
      return fg("accent", toolName) + fg("dim", ` ${truncate(JSON.stringify(args), 80)}`);
  }
}

function getDisplayPreviewLines(
  items: DisplayItem[],
  theme: Theme,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const item of items) {
    if (item.type === "text") {
      for (const line of item.text.replace(/\r\n?/g, "\n").split("\n")) {
        lines.push(...wrapLines(theme.fg("toolOutput", line), width));
      }
      continue;
    }
    lines.push(
      ...wrapLines(
        theme.fg("muted", "→ ") +
          formatToolCall(item.name, item.args, theme.fg.bind(theme)),
        width,
      ),
    );
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function statusIcon(result: SingleResult, theme: Theme): string {
  if (result.exitCode === -1) return theme.fg("warning", "⏳");
  return isResultError(result)
    ? theme.fg("error", "✗")
    : theme.fg("success", "✓");
}

function usageLine(
  usage: Partial<UsageStats>,
  model: string | undefined,
  theme: Theme,
  label = "Usage",
): string | null {
  const text = formatUsage(usage, model);
  return text ? theme.fg("dim", `${label} ${text}`) : null;
}

// ---------------------------------------------------------------------------
// renderCall — shown while the tool is being invoked
// ---------------------------------------------------------------------------

export function renderCall(
  args: SubagentRenderArgs | undefined,
  theme: Theme,
  context: RenderContext,
): Component {
  const safeArgs = args ?? {};
  const delegationMode = normalizeDelegationMode(safeArgs.mode);
  const modeBadge = theme.fg("muted", ` [${delegationMode}]`);

  return {
    invalidate() {},
    render(width: number): string[] {
      const lines: string[] = [];
      if (safeArgs.tasks && safeArgs.tasks.length > 0) {
        appendWrapped(
          lines,
          theme.fg("toolTitle", theme.bold("subagent ")) +
            theme.fg("accent", `parallel (${safeArgs.tasks.length} tasks)`) +
            modeBadge,
          width,
        );
        const completed = new Set<number>();
        context.state.details?.results.forEach((result, index) => {
          if (result.exitCode !== -1) completed.add(index);
        });
        for (const [index, task] of safeArgs.tasks.entries()) {
          if (completed.has(index)) continue;
          const prefix = theme.fg("accent", `${index + 1}. `);
          lines.push(
            prefix +
              theme.fg(
                "dim",
                truncateLine(task.task || "...", width - visibleWidth(prefix)),
              ),
          );
        }
        return lines;
      }

      appendWrapped(
        lines,
        theme.fg("toolTitle", theme.bold("subagent ")) +
          theme.fg("accent", "task") +
          modeBadge,
        width,
      );
      if (!context.state.complete) {
        lines.push(theme.fg("dim", truncateLine(safeArgs.task || "...", width)));
      }
      return lines;
    },
  };
}

// ---------------------------------------------------------------------------
// renderResult — shown after the tool completes
// ---------------------------------------------------------------------------

export function renderResult(
  result: { content: Array<{ type: string; text?: string }>; details?: unknown },
  state: RenderState,
  theme: Theme,
  context: RenderContext,
): Component {
  const isPartial = state.isPartial ?? false;
  const details = result.details as SubagentDetails | undefined;
  const mode = currentViewMode;
  context.state.details = details;
  context.state.complete = !isPartial;

  if (!details || details.results.length === 0) {
    return component((width) => {
      const output = getSanitizedTextOutput(result).trim() || "(no output)";
      const lines: string[] = [];
      appendWrapped(lines, output, width);
      return lines;
    });
  }

  if (!isPartial) {
    const cached = resultCache.get(details)?.[mode];
    if (cached) return cached;
  }

  const render =
    mode === "minimal"
      ? renderMinimalResult(details, isPartial, theme)
      : details.mode === "single"
        ? renderExpandedResult(
            details.results[0],
            details.delegationMode,
            mode === "expanded",
            theme,
          )
        : renderParallelResult(
            details,
            details.delegationMode,
            mode === "expanded",
            theme,
          );

  if (!isPartial) {
    const pair = resultCache.get(details) || {};
    pair[mode] = render;
    resultCache.set(details, pair);
  }
  return render;
}

function renderMinimalResult(
  details: SubagentDetails,
  isPartial: boolean,
  theme: Theme,
): Component {
  return {
    invalidate() {},
    render(width: number): string[] {
      const lines: string[] = [makeSep(theme, width)];
      for (const [index, result] of details.results.entries()) {
        const label =
          details.mode === "parallel" ? `subagent ${index + 1}` : "subagent";
        appendWrapped(
          lines,
          `${statusIcon(result, theme)} ${theme.fg("accent", label)}`,
          width,
        );
        if (result.exitCode !== -1) {
          appendWrapped(
            lines,
            theme.fg("dim", truncateLine(result.task, width)),
            width,
          );
        }

        const recoveryStatus = getRecoveryStatusText(result);
        if (recoveryStatus) {
          appendWrapped(
            lines,
            theme.fg(
              result.recoveryInProgress ? "warning" : "muted",
              recoveryStatus,
            ),
            width,
          );
        }
      }

      if (!isPartial) {
        const usage =
          details.mode === "single"
            ? usageLine(
                details.results[0].usage,
                details.results[0].model,
                theme,
              )
            : usageLine(
                sumUsage(details.results),
                undefined,
                theme,
                "Total usage",
              );
        if (usage) appendWrapped(lines, usage, width);
      }
      lines.push(makeSep(theme, width));
      return lines;
    },
  };
}

function renderExpandedResult(
  result: SingleResult,
  delegationMode: DelegationMode,
  expanded: boolean,
  theme: Theme,
): Component {
  return component((width) => {
    const error = isResultError(result);
    const displayItems = getDisplayItems(result.messages);
    const lines: string[] = [];
    const header = `${statusIcon(result, theme)} ${theme.fg("toolTitle", theme.bold("subagent"))}${theme.fg("muted", ` (${delegationMode})`)}`;
    appendWrapped(lines, header, width);
    if (error && result.stopReason) {
      appendWrapped(lines, theme.fg("error", `Error ${result.stopReason}`), width);
    }

    const recoveryStatus = getRecoveryStatusText(result);
    if (recoveryStatus) {
      appendWrapped(
        lines,
        theme.fg(result.recoveryInProgress ? "warning" : "muted", recoveryStatus),
        width,
      );
    }

    lines.push(makeSep(theme, width));
    const emptyOutput =
      result.exitCode === -1 ? "(running...)" : "(no output)";
    if (expanded) {
      appendWrapped(lines, theme.fg("muted", "Task"), width);
      appendWrapped(lines, theme.fg("dim", result.task), width);
      lines.push(makeSep(theme, width));
      appendWrapped(lines, theme.fg("muted", "Output"), width);
      const outputLines = getExpandedOutputLines(
        result,
        displayItems,
        error,
        theme,
        width,
      );
      if (outputLines.length > 0) lines.push(...outputLines);
      else appendWrapped(lines, theme.fg("muted", emptyOutput), width);
    } else {
      const previewLines = getCollapsedPreviewLines(
        result,
        displayItems,
        error,
        theme,
        width,
      );
      if (previewLines.length > COLLAPSED_LINE_COUNT) {
        appendPreview(
          lines,
          previewLines,
          width,
          COLLAPSED_LINE_COUNT,
          theme.fg("muted", "... ({count} earlier lines, expand for more)"),
        );
      } else if (previewLines.length > 0) {
        lines.push(...previewLines);
      } else {
        appendWrapped(lines, theme.fg("muted", emptyOutput), width);
      }
    }

    const usage = usageLine(result.usage, result.model, theme);
    if (usage) {
      lines.push(makeSep(theme, width));
      appendWrapped(lines, usage, width);
    }
    lines.push(makeSep(theme, width));
    return lines;
  });
}

function renderParallelResult(
  details: SubagentDetails,
  delegationMode: DelegationMode,
  expanded: boolean,
  theme: Theme,
): Component {
  return component((width) => {
    const running = details.results.filter(
      (result) => result.exitCode === -1,
    ).length;
    const done = details.results.length - running;
    const succeeded = details.results.filter(
      (result) => result.exitCode !== -1 && !isResultError(result),
    ).length;
    const failed = details.results.filter(
      (result) => result.exitCode !== -1 && isResultError(result),
    ).length;
    const icon =
      running > 0
        ? theme.fg("warning", "⏳")
        : failed > 0
          ? theme.fg("warning", "◐")
          : theme.fg("success", "✓");
    const status =
      running > 0
        ? `${done}/${details.results.length} done, ${running} running`
        : `${succeeded}/${details.results.length} tasks`;
    const lines: string[] = [];

    appendWrapped(
      lines,
      `${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}${theme.fg("muted", ` [${delegationMode}]`)}`,
      width,
    );
    lines.push(makeSep(theme, width));

    for (const [index, result] of details.results.entries()) {
      if (index > 0) lines.push(makeSep(theme, width));
      appendWrapped(
        lines,
        `${statusIcon(result, theme)} ${theme.fg("accent", `subagent ${index + 1}`)}`,
        width,
      );

      const recoveryStatus = getRecoveryStatusText(result);
      if (recoveryStatus) {
        appendWrapped(
          lines,
          theme.fg(
            result.recoveryInProgress ? "warning" : "muted",
            recoveryStatus,
          ),
          width,
        );
      }

      const error = isResultError(result);
      const displayItems = getDisplayItems(result.messages);
      const emptyOutput =
        result.exitCode === -1 ? "(running...)" : "(no output)";

      if (expanded) {
        appendWrapped(lines, theme.fg("muted", "Task"), width);
        appendWrapped(lines, theme.fg("dim", result.task), width);
        appendWrapped(lines, theme.fg("muted", "Output"), width);
        const outputLines = getExpandedOutputLines(
          result,
          displayItems,
          error,
          theme,
          width,
        );
        if (outputLines.length > 0) lines.push(...outputLines);
        else appendWrapped(lines, theme.fg("muted", emptyOutput), width);

        const usage = usageLine(result.usage, result.model, theme);
        if (usage) {
          lines.push(makeSep(theme, width));
          appendWrapped(lines, usage, width);
        }
        continue;
      }

      const previewLines = getCollapsedPreviewLines(
        result,
        displayItems,
        error,
        theme,
        width,
      );
      if (previewLines.length > COLLAPSED_PARALLEL_LINE_COUNT) {
        appendPreview(
          lines,
          previewLines,
          width,
          COLLAPSED_PARALLEL_LINE_COUNT,
          theme.fg("muted", "... ({count} earlier lines, expand for more)"),
        );
      } else if (previewLines.length > 0) {
        lines.push(...previewLines);
      } else {
        appendWrapped(lines, theme.fg("muted", emptyOutput), width);
      }
    }

    if (running === 0) {
      const totalUsage = usageLine(
        sumUsage(details.results),
        undefined,
        theme,
        "Total usage",
      );
      if (totalUsage) {
        lines.push(makeSep(theme, width));
        appendWrapped(lines, totalUsage, width);
      }
    }
    lines.push(makeSep(theme, width));
    return lines;
  });
}

function getCollapsedPreviewLines(
  result: SingleResult,
  displayItems: DisplayItem[],
  error: boolean,
  theme: Theme,
  width: number,
): string[] {
  if (error) {
    const message = getResultErrorText(result);
    return message ? wrapLines(theme.fg("error", `Error: ${message}`), width) : [];
  }
  return getDisplayPreviewLines(displayItems, theme, width);
}

function getExpandedOutputLines(
  result: SingleResult,
  displayItems: DisplayItem[],
  error: boolean,
  theme: Theme,
  width: number,
): string[] {
  const lines: string[] = [];
  if (error) {
    const errorText = getResultErrorText(result);
    if (errorText) appendWrapped(lines, theme.fg("error", `Error: ${errorText}`), width);
  }

  const finalOutput = !error ? getFinalOutput(result.messages).trim() : "";
  const finalOutputLines = finalOutput
    ? renderMarkdownLines(finalOutput, width, theme)
    : [];
  const previewItems = stripTrailingFinalOutputItem(displayItems, finalOutput);
  const previewLines = getDisplayPreviewLines(previewItems, theme, width);

  if (previewLines.length > 0) lines.push(...previewLines);
  if (finalOutputLines.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(...finalOutputLines);
  }
  return lines;
}
