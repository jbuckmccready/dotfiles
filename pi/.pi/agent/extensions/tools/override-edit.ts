import {
    highlightCode,
    getLanguageFromPath,
    type AgentToolResult,
    type AgentToolUpdateCallback,
    type EditToolDetails,
    type ExtensionContext,
    type Theme,
    type ToolRenderResultOptions,
    withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import {
    Text,
    visibleWidth,
    truncateToWidth,
    wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import * as Diff from "diff";
import { shortenPath, component, getSanitizedTextOutput } from "./shared";
import type { SandboxAPI } from "./sandbox-shared";
import { getToolViewMode } from "./tool-view-mode";
import {
    type EditItem,
    type PatchOperation,
    applyClassicEdits,
    buildClassicEdits,
    applyPatchOperations,
    createRealWorkspace,
    createVirtualWorkspace,
    getClassicTouchedPaths,
    getPatchTouchedPaths,
    parsePatch,
} from "./multi-edit-core";

// darken(color, factor, base) where base = #1e1e2e
const ADDED_LINE_BG = "\x1b[48;2;48;66;52m"; // darken(#a6e3a1, 0.18)
const REMOVED_LINE_BG = "\x1b[48;2;59;40;56m"; // darken(#f38ba8, 0.18)
const ADDED_WORD_BG = "\x1b[48;2;72;104;75m"; // darken(#a6e3a1, 0.37)
const REMOVED_WORD_BG = "\x1b[48;2;109;58;93m"; // darken(#f38ba8, 0.37)

const STRIP_ANSI = /\x1b\[[0-9;]*m/g;

const editItemSchema = Type.Object({
    path: Type.Optional(
        Type.String({
            description:
                "Path to the file to edit (relative or absolute). Inherits from top-level path if omitted.",
        }),
    ),
    oldText: Type.String({
        description: "Exact text to find and replace (must match exactly)",
    }),
    newText: Type.String({
        description: "New text to replace the old text with",
    }),
});

const editSchema = Type.Object({
    path: Type.Optional(
        Type.String({
            description: "Path to the file to edit (relative or absolute)",
        }),
    ),
    oldText: Type.Optional(
        Type.String({
            description: "Exact text to find and replace (must match exactly)",
        }),
    ),
    newText: Type.Optional(
        Type.String({ description: "New text to replace the old text with" }),
    ),
    multi: Type.Optional(
        Type.Array(editItemSchema, {
            description:
                "Multiple edits to apply in sequence. Each item has path, oldText, and newText.",
        }),
    ),
    patch: Type.Optional(
        Type.String({
            description:
                "Codex-style apply_patch payload (*** Begin Patch ... *** End Patch). Mutually exclusive with path/oldText/newText/multi.",
        }),
    ),
});

type MultiEditInput = Static<typeof editSchema>;
type EditRenderArgs = Partial<MultiEditInput> & { file_path?: string };
type EditCallRenderContext = { state: Record<string, never>; isPartial: boolean };
type EditRenderContext = { args: EditRenderArgs; isError: boolean };

function parseDiffLine(line: string) {
    const match = line.match(/^([+-\s])(\s*\d*)\s(.*)$/);
    if (!match) return null;
    return { prefix: match[1], lineNum: match[2], content: match[3] };
}

function collectLines(lines: string[], i: number, prefix: string) {
    const collected: { lineNum: string; content: string }[] = [];
    while (i < lines.length) {
        const parsed = parseDiffLine(lines[i]);
        if (!parsed || parsed.prefix !== prefix) break;
        collected.push({ lineNum: parsed.lineNum, content: parsed.content });
        i++;
    }
    return { collected, i };
}

function countLines(text: string) {
    if (!text) return 0;
    const lineCount = text.split("\n").length;
    return text.endsWith("\n") ? lineCount - 1 : lineCount;
}

function getLineChangeCounts(oldText: string, newText: string) {
    let added = 0;
    let removed = 0;
    const a = oldText.endsWith("\n") ? oldText : oldText + "\n";
    const b = newText.endsWith("\n") ? newText : newText + "\n";

    for (const part of Diff.diffLines(a, b)) {
        const lineCount = countLines(part.value);
        if (part.added) {
            added += lineCount;
        } else if (part.removed) {
            removed += lineCount;
        }
    }

    return { added, removed };
}

function getEditItemsLineChangeCounts(
    edits: Array<{ oldText: string; newText: string }>,
) {
    let added = 0;
    let removed = 0;

    for (const edit of edits) {
        const counts = getLineChangeCounts(edit.oldText, edit.newText);
        added += counts.added;
        removed += counts.removed;
    }

    return { added, removed };
}

/**
 * Apply a background ANSI escape to a range of visible characters in an
 * ANSI-styled string, then restore the previous background afterward.
 */
function applyBgToRange(
    ansiStr: string,
    start: number,
    end: number,
    bg: string,
    restoreBg: string,
): string {
    if (!ansiStr || start >= end || end <= 0) return ansiStr;

    const rangeStart = Math.max(0, start);
    const rangeEnd = Math.max(rangeStart, end);

    let result = "";
    let visIdx = 0;
    let i = 0;
    let inRange = false;
    while (i < ansiStr.length) {
        // Pass through ANSI escapes without counting
        if (ansiStr[i] === "\x1b") {
            const escEnd = ansiStr.indexOf("m", i);
            if (escEnd !== -1) {
                result += ansiStr.slice(i, escEnd + 1);
                i = escEnd + 1;
                continue;
            }
        }
        if (visIdx === rangeStart && !inRange) {
            result += bg;
            inRange = true;
        }
        if (visIdx === rangeEnd && inRange) {
            result += restoreBg;
            inRange = false;
        }
        result += ansiStr[i];
        visIdx++;
        i++;
    }
    if (inRange) result += restoreBg;
    return result;
}

/**
 * Compute word diff on plain text, then apply word-highlight backgrounds
 * onto the syntax-highlighted versions of those lines.
 */
function renderIntraLineDiff(
    oldPlain: string,
    newPlain: string,
    oldHighlighted: string,
    newHighlighted: string,
    removedWordBg: string,
    addedWordBg: string,
    removedLineBg: string,
    addedLineBg: string,
) {
    const parts = Diff.diffWords(oldPlain, newPlain);
    let oldPos = 0;
    let newPos = 0;
    let removedLine = oldHighlighted;
    let addedLine = newHighlighted;

    // Collect ranges to highlight, applied in reverse order to preserve positions
    const removedRanges: { start: number; end: number }[] = [];
    const addedRanges: { start: number; end: number }[] = [];

    const addChangedRange = (
        ranges: { start: number; end: number }[],
        pos: number,
        value: string,
        skipLeadingWhitespace: boolean,
    ) => {
        const len = value.length;
        const wsLen = skipLeadingWhitespace
            ? (value.match(/^(\s*)/)?.[1] || "").length
            : 0;
        if (len > wsLen) {
            ranges.push({ start: pos + wsLen, end: pos + len });
        }
        return pos + len;
    };

    for (const part of parts) {
        const isFirstChangedPart =
            removedRanges.length === 0 && addedRanges.length === 0;

        if (part.removed) {
            oldPos = addChangedRange(
                removedRanges,
                oldPos,
                part.value,
                isFirstChangedPart,
            );
        } else if (part.added) {
            newPos = addChangedRange(
                addedRanges,
                newPos,
                part.value,
                isFirstChangedPart,
            );
        } else {
            oldPos += part.value.length;
            newPos += part.value.length;
        }
    }

    // Apply ranges in reverse so positions stay valid
    for (let r = removedRanges.length - 1; r >= 0; r--) {
        removedLine = applyBgToRange(
            removedLine,
            removedRanges[r].start,
            removedRanges[r].end,
            removedWordBg,
            removedLineBg,
        );
    }
    for (let r = addedRanges.length - 1; r >= 0; r--) {
        addedLine = applyBgToRange(
            addedLine,
            addedRanges[r].start,
            addedRanges[r].end,
            addedWordBg,
            addedLineBg,
        );
    }

    return { removedLine, addedLine };
}

function fmtLine(
    theme: Theme,
    color: "toolDiffRemoved" | "toolDiffAdded" | "toolDiffContext",
    prefix: string,
    lineNum: string,
    content: string,
) {
    return theme.fg(color, `${prefix}${lineNum} `) + content;
}

function renderDiff(diffText: string, theme: Theme, lang?: string): string {
    const lines = diffText.split("\n");
    const tabs = (text: string) => text.replace(/\t/g, "   ");

    // Batch-highlight: collect all content lines, call highlightCode once
    // instead of per-line (amortizes grammar/tokenizer initialization).
    const allPlain: string[] = [];
    for (const line of lines) {
        const parsed = parseDiffLine(line);
        if (parsed) allPlain.push(tabs(parsed.content));
    }
    const allHighlighted =
        lang && allPlain.length > 0
            ? highlightCode(allPlain.join("\n"), lang)
            : allPlain;
    let highlightedIndex = 0;
    const nextHighlighted = () => {
        const index = highlightedIndex++;
        return allHighlighted[index] ?? allPlain[index] ?? "";
    };

    const result: string[] = [];
    let i = 0;
    while (i < lines.length) {
        const parsed = parseDiffLine(lines[i]);
        if (!parsed) {
            result.push(theme.fg("toolDiffContext", lines[i]));
            i++;
            continue;
        }
        if (parsed.prefix === "-") {
            const removed = collectLines(lines, i, "-");
            const added = collectLines(lines, removed.i, "+");
            i = added.i;

            if (
                removed.collected.length === 1 &&
                added.collected.length === 1
            ) {
                const removedLine = removed.collected[0];
                const addedLine = added.collected[0];
                const removedPlain = tabs(removedLine.content);
                const addedPlain = tabs(addedLine.content);
                const {
                    removedLine: highlightedRemoved,
                    addedLine: highlightedAdded,
                } = renderIntraLineDiff(
                    removedPlain,
                    addedPlain,
                    nextHighlighted(),
                    nextHighlighted(),
                    REMOVED_WORD_BG,
                    ADDED_WORD_BG,
                    REMOVED_LINE_BG,
                    ADDED_LINE_BG,
                );
                result.push(
                    fmtLine(
                        theme,
                        "toolDiffRemoved",
                        "-",
                        removedLine.lineNum,
                        highlightedRemoved,
                    ),
                );
                result.push(
                    fmtLine(
                        theme,
                        "toolDiffAdded",
                        "+",
                        addedLine.lineNum,
                        highlightedAdded,
                    ),
                );
            } else {
                for (const removedLine of removed.collected) {
                    result.push(
                        fmtLine(
                            theme,
                            "toolDiffRemoved",
                            "-",
                            removedLine.lineNum,
                            nextHighlighted(),
                        ),
                    );
                }
                for (const addedLine of added.collected) {
                    result.push(
                        fmtLine(
                            theme,
                            "toolDiffAdded",
                            "+",
                            addedLine.lineNum,
                            nextHighlighted(),
                        ),
                    );
                }
            }
        } else if (parsed.prefix === "+") {
            result.push(
                fmtLine(
                    theme,
                    "toolDiffAdded",
                    "+",
                    parsed.lineNum,
                    nextHighlighted(),
                ),
            );
            i++;
        } else {
            result.push(
                fmtLine(
                    theme,
                    "toolDiffContext",
                    " ",
                    parsed.lineNum,
                    nextHighlighted(),
                ),
            );
            i++;
        }
    }
    return result.join("\n");
}

function hasClassicFields(params: MultiEditInput): boolean {
    return (
        params.path !== undefined ||
        params.oldText !== undefined ||
        params.newText !== undefined ||
        params.multi !== undefined
    );
}

async function withMutationQueues<T>(
    paths: string[],
    fn: () => Promise<T>,
): Promise<T> {
    const unique = Array.from(new Set(paths)).sort();
    const run = (index: number): Promise<T> => {
        if (index >= unique.length) return fn();
        return withFileMutationQueue(unique[index], () => run(index + 1));
    };
    return run(0);
}

function getFileRenderMeta(paths: string[]) {
    const uniquePaths = Array.from(new Set(paths.map((path) => path.replace(/^@/, ""))));
    const singlePath = uniquePaths.length === 1 ? uniquePaths[0] : undefined;
    return {
        uniquePaths,
        singlePath,
        labelFilesInBody: uniquePaths.length > 1,
    };
}

function formatDisplayPath(path: string): string {
    return shortenPath(path.replace(/^@/, ""));
}

function combineDiffs(results: Array<{ path: string; diff?: string }>): string {
    const diffs = results.filter(
        (result): result is { path: string; diff: string } =>
            typeof result.diff === "string" && result.diff.length > 0,
    );
    if (diffs.length === 0) return "";

    const { labelFilesInBody } = getFileRenderMeta(
        diffs.map((result) => result.path),
    );

    return diffs
        .map((result) =>
            labelFilesInBody
                ? `File: ${result.path}\n${result.diff}`
                : result.diff,
        )
        .join("\n\n");
}

function getRenderClassicItems(args: EditRenderArgs): EditItem[] {
    try {
        return buildClassicEdits(args as MultiEditInput).filter(
            (item) =>
                typeof item.path === "string" &&
                typeof item.oldText === "string" &&
                typeof item.newText === "string",
        );
    } catch {
        return [];
    }
}

function getClassicRenderMeta(args: EditRenderArgs):
    | {
          display: string;
          added: number;
          removed: number;
          singlePath?: string;
      }
    | undefined {
    const classicItems = getRenderClassicItems(args);
    if (classicItems.length > 0) {
        const fileMeta = getFileRenderMeta(classicItems.map((item) => item.path));
        const counts = getEditItemsLineChangeCounts(classicItems);
        return {
            display: fileMeta.singlePath
                ? formatDisplayPath(fileMeta.singlePath)
                : `${fileMeta.uniquePaths.length} files, ${classicItems.length} edits`,
            added: counts.added,
            removed: counts.removed,
            singlePath: fileMeta.singlePath,
        };
    }

    const rawPath = args.file_path ?? args.path;
    if (typeof rawPath !== "string") return undefined;

    const singlePath = rawPath.replace(/^@/, "");
    return {
        display: formatDisplayPath(singlePath),
        added: 0,
        removed: 0,
        singlePath,
    };
}

function summarizePatchOperations(ops: PatchOperation[]): string | undefined {
    const counts = new Map<string, number>();
    for (const op of ops) counts.set(op.kind, (counts.get(op.kind) ?? 0) + 1);
    return ["add", "update", "delete"]
        .map((kind) => {
            const count = counts.get(kind);
            return count ? `${count} ${kind}` : undefined;
        })
        .filter((part): part is string => Boolean(part))
        .join(", ");
}

function getPatchRenderMeta(patch: string):
    | { display: string; summary: string | undefined; singlePath?: string }
    | undefined {
    try {
        const ops = parsePatch(patch);
        const fileMeta = getFileRenderMeta(ops.map((op) => op.path));
        return {
            display: fileMeta.singlePath
                ? formatDisplayPath(fileMeta.singlePath)
                : `${fileMeta.uniquePaths.length} files`,
            summary: summarizePatchOperations(ops),
            singlePath: fileMeta.singlePath,
        };
    } catch {
        return undefined;
    }
}

class DiffText {
    private text: string;
    private boxBg: string;
    private cachedWidth: number | undefined;
    private cachedLines: string[] | undefined;

    constructor(text: string, boxBg: string) {
        this.text = text;
        this.boxBg = boxBg;
    }

    invalidate() {
        this.cachedWidth = undefined;
        this.cachedLines = undefined;
    }

    render(width: number): string[] {
        if (this.cachedLines && this.cachedWidth === width) {
            return this.cachedLines;
        }
        const lines = this.text.split("\n").map((line) => {
            const raw = line.replace(STRIP_ANSI, "");
            if (raw.startsWith("+") || raw.startsWith("-")) {
                const bg = raw.startsWith("+")
                    ? ADDED_LINE_BG
                    : REMOVED_LINE_BG;
                const truncated = truncateToWidth(line, width);
                const pad = Math.max(0, width - visibleWidth(truncated));
                return `${bg}${truncated}${" ".repeat(pad)}${this.boxBg}`;
            }
            return truncateToWidth(line, width);
        });
        this.cachedWidth = width;
        this.cachedLines = lines;
        return this.cachedLines;
    }
}

export function createEditOverride(sandbox: SandboxAPI) {
    const diffTextCache = new WeakMap<object, DiffText>();

    return {
        renderShell: "default",
        description:
            "Edit a file by replacing exact text. The oldText must match exactly (including whitespace). Use this for precise, surgical edits. Supports a `multi` parameter for batch edits across one or more files, and a `patch` parameter for Codex-style patches.",
        promptSnippet:
            "Edit a file by replacing exact text. The oldText must match exactly (including whitespace). Use this for precise, surgical edits.",
        promptGuidelines: [
            "Use edit for precise changes (old text must match exactly)",
            "Use the `multi` parameter to apply multiple edits in a single tool call",
            "Use the `patch` parameter for Codex-style multi-file / hunk-based edits",
        ],
        parameters: editSchema,

        async execute(
            _toolCallId: string,
            params: MultiEditInput,
            signal: AbortSignal | undefined,
            _onUpdate:
                | AgentToolUpdateCallback<EditToolDetails | undefined>
                | undefined,
            ctx: ExtensionContext,
        ): Promise<AgentToolResult<EditToolDetails | undefined>> {
            const cwd = sandbox.translatePath(ctx.cwd);
            const realWorkspace = createRealWorkspace(sandbox.getOps().edit);

            if (params.patch !== undefined) {
                if (hasClassicFields(params)) {
                    throw new Error(
                        "The patch parameter is mutually exclusive with path/oldText/newText/multi.",
                    );
                }

                const ops = parsePatch(params.patch);
                const touchedPaths = getPatchTouchedPaths(ops, cwd);
                return withMutationQueues(touchedPaths, async () => {
                    const virtualWorkspace = createVirtualWorkspace(cwd, realWorkspace);
                    try {
                        await applyPatchOperations(
                            ops,
                            virtualWorkspace,
                            cwd,
                            signal,
                            { collectDiff: false },
                        );
                    } catch (err) {
                        const message =
                            err instanceof Error ? err.message : String(err);
                        throw new Error(
                            `Preflight failed before mutating files.\n${message}`,
                        );
                    }

                    const applied = await applyPatchOperations(
                        ops,
                        realWorkspace,
                        cwd,
                        signal,
                        { collectDiff: true },
                    );
                    const summary = applied
                        .map((result, index) => `${index + 1}. ${result.message}`)
                        .join("\n");
                    const firstChangedLine = applied.find(
                        (result) => result.firstChangedLine !== undefined,
                    )?.firstChangedLine;
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: `Applied patch with ${applied.length} operation(s).\n${summary}`,
                            },
                        ],
                        details: {
                            diff: combineDiffs(applied),
                            firstChangedLine,
                        },
                    };
                });
            }

            const edits = buildClassicEdits(params);
            const touchedPaths = getClassicTouchedPaths(edits, cwd);
            return withMutationQueues(touchedPaths, async () => {
                const virtualWorkspace = createVirtualWorkspace(cwd, realWorkspace);
                try {
                    await applyClassicEdits(
                        edits,
                        virtualWorkspace,
                        cwd,
                        signal,
                        { collectDiff: false },
                    );
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    throw new Error(
                        `Preflight failed before mutating files.\n${message}`,
                    );
                }

                const results = await applyClassicEdits(
                    edits,
                    realWorkspace,
                    cwd,
                    signal,
                    { collectDiff: true },
                );

                if (results.length === 1) {
                    const result = results[0];
                    return {
                        content: [{ type: "text" as const, text: result.message }],
                        details: {
                            diff: result.diff ?? "",
                            firstChangedLine: result.firstChangedLine,
                        },
                    };
                }

                const summary = results
                    .map((result, index) => `${index + 1}. ${result.message}`)
                    .join("\n");
                const firstChangedLine = results.find(
                    (result) => result.firstChangedLine !== undefined,
                )?.firstChangedLine;
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Applied ${results.length} edit(s) successfully.\n${summary}`,
                        },
                    ],
                    details: {
                        diff: combineDiffs(results),
                        firstChangedLine,
                    },
                };
            });
        },

        renderCall(
            args: EditRenderArgs,
            theme: Theme,
            context: EditCallRenderContext,
        ) {
            let display = theme.fg("toolOutput", "...");
            let suffix = "";

            if (typeof args.patch === "string") {
                const patchMeta = getPatchRenderMeta(args.patch);
                display = theme.fg("accent", patchMeta?.display ?? "patch");
                if (!context.isPartial && patchMeta?.summary) {
                    suffix = ` ${theme.fg("toolOutput", patchMeta.summary)}`;
                }
            } else {
                const classicMeta = getClassicRenderMeta(args);
                if (classicMeta) {
                    display = theme.fg("accent", classicMeta.display);
                    if (!context.isPartial) {
                        suffix =
                            " " +
                            theme.fg("toolDiffAdded", `+${classicMeta.added}`) +
                            " " +
                            theme.fg("toolDiffRemoved", `-${classicMeta.removed}`);
                    }
                }
            }

            const title = `${theme.fg("toolTitle", theme.bold("edit"))} ${display}${suffix}`;
            return component((width) => wrapTextWithAnsi(title, width));
        },

        renderResult(
            result: AgentToolResult<EditToolDetails | undefined>,
            { isPartial }: ToolRenderResultOptions,
            theme: Theme,
            context: EditRenderContext,
        ) {
            const details = result.details;
            const isError = context.isError;
            const patchMeta =
                typeof context.args.patch === "string"
                    ? getPatchRenderMeta(context.args.patch)
                    : undefined;
            const classicMeta =
                typeof context.args.patch === "string"
                    ? undefined
                    : getClassicRenderMeta(context.args);

            if (isPartial) {
                return new Text(theme.fg("warning", "Editing..."), 0, 0);
            }

            const text = getSanitizedTextOutput(result);
            if (isError) {
                return new Text(theme.fg("error", text), 0, 0);
            }

            if (!details?.diff) {
                return new Text(text, 0, 0);
            }

            if (getToolViewMode() === "minimal") {
                return component(() => []);
            }

            const cached = diffTextCache.get(details);
            if (cached) return cached;

            const singlePath = patchMeta?.singlePath ?? classicMeta?.singlePath;
            const lang = singlePath ? getLanguageFromPath(singlePath) : undefined;

            const rendered = renderDiff(details.diff, theme, lang);
            const boxBg = theme.getBgAnsi("toolSuccessBg");
            const diffText = new DiffText(rendered, boxBg);
            diffTextCache.set(details, diffText);
            return diffText;
        },
    };
}
