/**
 * TUI rendering for subagent tool calls and results.
 */

import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import {
	Markdown,
	type MarkdownTheme,
	type Component,
	visibleWidth,
	wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import {
	type DelegationMode,
	type DisplayItem,
	type SingleResult,
	type SubagentDetails,
	type UsageStats,
	DEFAULT_DELEGATION_MODE,
	aggregateUsage,
	getDisplayItems,
	getFinalOutput,
	getRecoveryStatusText,
	getResultErrorText,
	isResultError,
} from "./types";
import {
	component,
	getSanitizedTextOutput,
	replaceTabs,
	shortenPath,
} from "../tools/shared";
import type { ToolViewMode } from "../tools/tool-view-mode";

let currentViewMode: ToolViewMode = "minimal";

export function setViewMode(mode: ToolViewMode) {
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
type SubagentTaskArgs = { agent?: string; task?: string };
type SubagentRenderArgs = {
	agent?: string;
	task?: string;
	tasks?: SubagentTaskArgs[];
	mode?: unknown;
};

type RenderContext = {
	state: RowRenderState;
};

const resultCache = new WeakMap<object, CompCache>();

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	return `${(count / 1000000).toFixed(1)}M`;
}

function formatUsage(usage: Partial<UsageStats>, model?: string): string {
	const parts: string[] = [];
	if (usage.turns) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
	if (usage.toolCalls) parts.push(`${usage.toolCalls} tool call${usage.toolCalls > 1 ? "s" : ""}`);
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`);
	if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
	if (usage.contextTokens && usage.contextTokens > 0) parts.push(`ctx:${formatTokens(usage.contextTokens)}`);
	if (model) parts.push(model);
	return parts.join(" ");
}

function truncate(text: unknown, maxLen: number): string {
	const value = typeof text === "string" ? text : text == null ? "" : String(text);
	return value.length > maxLen ? `${value.slice(0, maxLen)}...` : value;
}

/** Width-aware single-line truncation that returns plain text (no ANSI codes).
 *  Callers wrap the result with theme.fg() so the "…" inherits correct colors. */
function truncateLine(text: string, maxWidth: number): string {
	text = text.replace(/\s*[\r\n]+\s*/g, " ");
	if (maxWidth <= 0) return "";
	if (visibleWidth(text) <= maxWidth) return text;
	const target = maxWidth - 1; // reserve 1 column for "…"
	if (target <= 0) return "…";
	let end = text.length;
	while (end > 0 && visibleWidth(text.slice(0, end)) > target) end--;
	return text.slice(0, end) + "…";
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

function appendWrapped(lines: string[], text: string, width: number) {
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
		italic: (text) => theme.italic ? theme.italic(text) : text,
		underline: (text) => theme.underline ? theme.underline(text) : text,
		strikethrough: (text) => theme.strikethrough ? theme.strikethrough(text) : text,
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
	fromTail = true,
) {
	const shown = fromTail ? previewLines.slice(-limit) : previewLines.slice(0, limit);
	const skipped = previewLines.length - shown.length;
	if (skipped > 0) appendWrapped(lines, hint.replace("{count}", String(skipped)), width);
	lines.push(...shown);
}

function stripTrailingFinalOutputItem(items: DisplayItem[], finalOutput: string): DisplayItem[] {
	if (!finalOutput || items.length === 0) return items;
	const lastItem = items[items.length - 1];
	if (!lastItem || lastItem.type !== "text") return items;
	return lastItem.text.trim() === finalOutput ? items.slice(0, -1) : items;
}

function formatToolCall(toolName: string, args: Record<string, unknown>, fg: ThemeFg): string {
	const pathArg = (args.file_path || args.path || "...") as string;

	switch (toolName) {
		case "bash": {
			const cmd = (args.command as string) || "...";
			return fg("muted", "$ ") + fg("toolOutput", truncate(cmd, 120));
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
			return fg("muted", "find ") + fg("accent", (args.pattern || "*") as string) + fg("dim", ` in ${shortenPath((args.path || ".") as string)}`);
		case "grep":
			return fg("muted", "grep ") + fg("accent", `/${(args.pattern || "") as string}/`) + fg("dim", ` in ${shortenPath((args.path || ".") as string)}`);
		default:
			return fg("accent", toolName) + fg("dim", ` ${truncate(JSON.stringify(args), 80)}`);
	}
}

function getDisplayPreviewLines(items: DisplayItem[], theme: Theme, width: number): string[] {
	const lines: string[] = [];
	for (const item of items) {
		if (item.type === "text") {
			for (const line of item.text.replace(/\r\n?/g, "\n").split("\n")) {
				lines.push(...wrapLines(theme.fg("toolOutput", line), width));
			}
			continue;
		}
		lines.push(...wrapLines(theme.fg("muted", "→ ") + formatToolCall(item.name, item.args, theme.fg.bind(theme)), width));
	}
	while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	return lines;
}

function statusIcon(r: SingleResult, theme: Theme): string {
	if (r.exitCode === -1) return theme.fg("warning", "⏳");
	return isResultError(r) ? theme.fg("error", "✗") : theme.fg("success", "✓");
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
) {
	const safeArgs = args ?? {};
	const rowState = context.state;
	const delegationMode = normalizeDelegationMode(safeArgs.mode);
	const modeBadge = theme.fg("muted", ` [${delegationMode}]`);

	// No component() caching — must re-render each time to reflect completed tasks
	return {
		invalidate() {},
		render(width: number): string[] {
			const completedSet = new Set<number>();
			if (rowState.details) {
				rowState.details.results.forEach((r, i) => {
					if (r.exitCode !== -1) completedSet.add(i);
				});
			}
			const lines: string[] = [];

			if (safeArgs.tasks && safeArgs.tasks.length > 0) {
				appendWrapped(
					lines,
					theme.fg("toolTitle", theme.bold("subagent ")) +
						theme.fg("accent", `parallel (${safeArgs.tasks.length} tasks)`) +
						modeBadge,
					width,
				);
				// Show only pending tasks (not yet completed)
				for (let i = 0; i < safeArgs.tasks.length; i++) {
					if (completedSet.has(i)) continue;
					const task = safeArgs.tasks[i];
					const cPrefix = `${theme.fg("accent", task?.agent || "...")} `;
					const cTask = truncateLine(task?.task || "...", width - visibleWidth(cPrefix));
					lines.push(`${cPrefix}${theme.fg("dim", cTask)}`);
				}
				return lines;
			}

			appendWrapped(
				lines,
				theme.fg("toolTitle", theme.bold("subagent ")) + theme.fg("accent", safeArgs.agent || "...") + modeBadge,
				width,
			);
			// Show task description only while pending
			if (!rowState.complete) {
				lines.push(theme.fg("dim", truncateLine(safeArgs.task || "...", width)));
			}
			return lines;
		},
	} as Component;
}

// ---------------------------------------------------------------------------
// renderResult — shown after the tool completes
// ---------------------------------------------------------------------------

export function renderResult(
	result: { content: Array<{ type: string; text?: string }>; details?: unknown },
	state: RenderState,
	theme: Theme,
	context: RenderContext,
) {
	const { isPartial } = state;
	const details = result.details as SubagentDetails | undefined;
	const mode = currentViewMode;
	const rowState = context.state;

	rowState.details = details;
	rowState.complete = !isPartial;

	if (!isPartial && details) {
		const cached = resultCache.get(details)?.[mode];
		if (cached) return cached;
	}

	if (!details || details.results.length === 0) {
		return component((width) => {
			const output = getSanitizedTextOutput(result).trim() || "(no output)";
			const lines: string[] = [];
			appendWrapped(lines, output, width);
			return lines;
		});
	}

	const delegationMode = normalizeDelegationMode(details.delegationMode);
	let comp: Component;

	if (mode === "minimal") {
		// No caching for minimal — must reflect latest partial state
		const lines: string[] = [];
		comp = {
			invalidate() {},
			render(width: number): string[] {
				lines.length = 0;
				// Show completed tasks with status icons
				const completed = details.results.filter((r) => r.exitCode !== -1);
				if (completed.length > 0) {
					lines.push(makeSep(theme, width));
					for (const r of completed) {
						const icon = statusIcon(r, theme);
						const rPrefix = `${icon} ${theme.fg("accent", r.agent)} `;
						const rTask = truncateLine(r.task, width - visibleWidth(rPrefix));
						lines.push(`${rPrefix}${theme.fg("dim", rTask)}`);
					}
				}
				// Show usage only when complete
				if (!isPartial) {
					if (details.mode === "single") {
						const r = details.results[0];
						const usage = usageLine(r.usage, r.model, theme);
						if (usage) appendWrapped(lines, usage, width);
					} else {
						const totalUsage = usageLine(aggregateUsage(details.results), undefined, theme, "Total usage");
						if (totalUsage) appendWrapped(lines, totalUsage, width);
					}
				}
				return lines;
			},
		} as Component;
	} else {
		const expanded = mode === "expanded";
		comp = details.mode === "single"
			? renderSingleResult(details.results[0], delegationMode, expanded, theme)
			: renderParallelResult(details, delegationMode, expanded, theme);
	}

	if (!isPartial && details) {
		const pair = resultCache.get(details) || {};
		pair[mode] = comp;
		resultCache.set(details, pair);
	}

	return comp;
}

// ---------------------------------------------------------------------------
// Single-mode result
// ---------------------------------------------------------------------------

function renderSingleResult(
	r: SingleResult,
	delegationMode: DelegationMode,
	expanded: boolean,
	theme: Theme,
) {
	return component((width) => {
		const error = isResultError(r);
		const icon = statusIcon(r, theme);
		const displayItems = getDisplayItems(r.messages);
		const header = `${icon} ${theme.fg("toolTitle", theme.bold(r.agent))}${theme.fg("muted", ` (${r.agentSource}, ${delegationMode})`)}`;
		const lines: string[] = [];
		appendWrapped(lines, header, width);
		if (error && r.stopReason) appendWrapped(lines, theme.fg("error", `Error ${r.stopReason}`), width);
		const recoveryStatus = getRecoveryStatusText(r);
		if (recoveryStatus) appendWrapped(lines, theme.fg(r.recoveryInProgress ? "warning" : "muted", recoveryStatus), width);
		lines.push(makeSep(theme, width));

		if (expanded) {
			appendWrapped(lines, theme.fg("muted", "Task"), width);
			appendWrapped(lines, theme.fg("dim", r.task), width);
			lines.push(makeSep(theme, width));
			appendWrapped(lines, theme.fg("muted", "Output"), width);

			const outputLines = getExpandedSingleOutputLines(r, displayItems, error, theme, width);
			if (outputLines.length > 0) lines.push(...outputLines);
			else appendWrapped(lines, theme.fg("muted", r.exitCode === -1 ? "(running...)" : "(no output)"), width);
		} else {
			const previewLines = getCollapsedSinglePreviewLines(r, displayItems, error, theme, width);
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
				appendWrapped(lines, theme.fg("muted", r.exitCode === -1 ? "(running...)" : "(no output)"), width);
			}
		}

		const usage = usageLine(r.usage, r.model, theme);
		if (usage) {
			lines.push(makeSep(theme, width));
			appendWrapped(lines, usage, width);
		}
		lines.push(makeSep(theme, width));
		return lines;
	});
}

function getCollapsedSinglePreviewLines(
	r: SingleResult,
	displayItems: DisplayItem[],
	error: boolean,
	theme: Theme,
	width: number,
): string[] {
	if (error) {
		const message = getResultErrorText(r);
		return message
			? wrapLines(theme.fg("error", `Error: ${message}`), width)
			: [];
	}
	return getDisplayPreviewLines(displayItems, theme, width);
}

function getExpandedSingleOutputLines(
	r: SingleResult,
	displayItems: DisplayItem[],
	error: boolean,
	theme: Theme,
	width: number,
): string[] {
	const lines: string[] = [];
	if (error) {
		const errorText = getResultErrorText(r);
		if (errorText) appendWrapped(lines, theme.fg("error", `Error: ${errorText}`), width);
	}

	const finalOutput = !error ? getFinalOutput(r.messages).trim() : "";
	const finalOutputLines = finalOutput ? renderMarkdownLines(finalOutput, width, theme) : [];
	const previewItems = stripTrailingFinalOutputItem(displayItems, finalOutput);
	const previewLines = getDisplayPreviewLines(previewItems, theme, width);

	if (previewLines.length > 0) lines.push(...previewLines);
	if (finalOutputLines.length > 0) {
		if (lines.length > 0) lines.push("");
		lines.push(...finalOutputLines);
	}
	return lines;
}

// ---------------------------------------------------------------------------
// Parallel-mode result
// ---------------------------------------------------------------------------

function renderParallelResult(
	details: SubagentDetails,
	delegationMode: DelegationMode,
	expanded: boolean,
	theme: Theme,
) {
	return component((width) => {
		const running = details.results.filter((r) => r.exitCode === -1).length;
		const doneCount = details.results.filter((r) => r.exitCode !== -1).length;
		const successCount = details.results.filter((r) => r.exitCode !== -1 && !isResultError(r)).length;
		const failCount = details.results.filter((r) => r.exitCode !== -1 && isResultError(r)).length;
		const isRunning = running > 0;
		const icon = isRunning
			? theme.fg("warning", "⏳")
			: failCount > 0
				? theme.fg("warning", "◐")
				: theme.fg("success", "✓");
		const status = isRunning
			? `${doneCount}/${details.results.length} done, ${running} running`
			: `${successCount}/${details.results.length} tasks`;

		const lines: string[] = [];
		appendWrapped(
			lines,
			`${icon} ${theme.fg("toolTitle", theme.bold("parallel "))}${theme.fg("accent", status)}${theme.fg("muted", ` [${delegationMode}]`)}`,
			width,
		);

		lines.push(makeSep(theme, width));

		for (const [index, result] of details.results.entries()) {
			if (index > 0) lines.push(makeSep(theme, width));
			appendWrapped(lines, `${statusIcon(result, theme)} ${theme.fg("accent", result.agent)}`, width);
			const recoveryStatus = getRecoveryStatusText(result);
			if (recoveryStatus) {
				appendWrapped(lines, theme.fg(result.recoveryInProgress ? "warning" : "muted", recoveryStatus), width);
			}
			if (expanded) {
				appendWrapped(lines, theme.fg("muted", "Task"), width);
				appendWrapped(lines, theme.fg("dim", result.task), width);
				appendWrapped(lines, theme.fg("muted", "Output"), width);
				const outputLines = getExpandedSingleOutputLines(result, getDisplayItems(result.messages), isResultError(result), theme, width);
				if (outputLines.length > 0) lines.push(...outputLines);
				else appendWrapped(lines, theme.fg("muted", result.exitCode === -1 ? "(running...)" : "(no output)"), width);
				const taskUsage = usageLine(result.usage, result.model, theme);
				if (taskUsage) {
					lines.push(makeSep(theme, width));
					appendWrapped(lines, taskUsage, width);
				}
				continue;
			}

			const previewLines = getCollapsedParallelPreviewLines(result, theme, width);
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
				appendWrapped(lines, theme.fg("muted", result.exitCode === -1 ? "(running...)" : "(no output)"), width);
			}
		}

		const totalUsage = !isRunning ? usageLine(aggregateUsage(details.results), undefined, theme, "Total usage") : null;
		if (totalUsage) {
			lines.push(makeSep(theme, width));
			appendWrapped(lines, totalUsage, width);
		}
		lines.push(makeSep(theme, width));
		return lines;
	});
}

function getCollapsedParallelPreviewLines(r: SingleResult, theme: Theme, width: number): string[] {
	if (isResultError(r)) {
		const message = getResultErrorText(r);
		return message
			? wrapLines(theme.fg("error", `Error: ${message}`), width)
			: [];
	}
	return getDisplayPreviewLines(getDisplayItems(r.messages), theme, width);
}
