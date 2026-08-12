import {
	generateDiffString,
	generateUnifiedPatch,
	renderDiff,
	withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import {
	Box,
	Container,
	getCapabilities,
	hyperlink,
	Spacer,
	Text,
	type Component,
} from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { createRealWorkspace, type Workspace } from "./multi-edit-core.ts";
import type { SandboxAPI } from "./sandbox-shared.ts";
import { getToolViewMode } from "./tool-view-mode.ts";

const APPLY_PATCH_LARK_GRAMMAR = String.raw`start: begin_patch file_operation+ end_patch
begin_patch: "*** Begin Patch" LF
end_patch: "*** End Patch" LF?

file_operation: add_file | delete_file | update_file
add_file: "*** Add File: " filename LF add_line+
delete_file: "*** Delete File: " filename LF
update_file: "*** Update File: " filename LF change_move? change

filename: /(.+)/
add_line: "+" /(.*)/ LF

change_move: "*** Move to: " filename LF
change: (change_context | change_line)+ eof_line?
change_context: ("@@" | "@@ " /(.+)/) LF
change_line: ("+" | "-" | " ") /(.*)/ LF
eof_line: "*** End of File" LF

%import common.LF`;

const TOOL_DESCRIPTION = `Apply a Codex-style patch to one or more files.

Patch format:
*** Begin Patch
*** Add File: path/to/file
+new file content
*** Update File: path/to/file
*** Move to: path/to/new-file
@@ optional context
 unchanged context
-old text
+new text
*** Delete File: path/to/file
*** End Patch

Every call must contain exactly one complete patch bounded by *** Begin Patch and *** End Patch. Update hunk rows use a leading space for context, - for removed rows, and + for inserted rows. An update may include a *** Move to: destination line before its hunks. Multiple file operations and multiple update hunks are allowed. Add and move operations overwrite existing destination files.`;

const TOOL_PROMPT_SNIPPET =
	"Apply Codex-style patches to add, update, or delete one or more files";

const TOOL_PROMPT_GUIDELINES = [
	"Use edit for file changes by passing one complete Codex-style patch.",
	"Start every edit patch with *** Begin Patch and end it with *** End Patch.",
	"Use *** Add File, *** Update File, and *** Delete File headers for each file operation.",
	"Place an optional *** Move to: destination line directly after an *** Update File header.",
	"In edit update hunks, prefix context rows with a space, removed rows with -, and inserted rows with +.",
	"Keep edit patch context small but sufficient to locate each change. Use multiple hunks or file operations in one call when needed.",
];

const editSchema = {
	type: "object",
	additionalProperties: false,
	required: ["text"],
	properties: {
		text: {
			type: "string",
			description: TOOL_DESCRIPTION,
		},
	},
} as any;

type EditParams = { text: string };
type ToolContent = Array<{ type: "text"; text: string }>;

type EditDetailsLike = {
	diff: string;
	patch: string;
	firstChangedLine?: number;
};

type PlannedFileChange = {
	kind: "update" | "write" | "add" | "delete";
	path: string;
	absolutePath: string;
	oldText: string;
	newText: string;
	oldExists: boolean;
	outputFormat?: TextFormat;
	renderChange: RenderChange | null;
};

type EditDetails = EditDetailsLike & {
	added: number;
	removed: number;
	files: Array<{
		path: string;
		kind: PlannedFileChange["kind"];
		details: EditDetailsLike;
	}>;
};

type PatchOperation =
	| { kind: "add"; path: string; contents: string }
	| { kind: "delete"; path: string }
	| {
			kind: "update";
			path: string;
			movePath?: string;
			chunks: UpdateChunk[];
	  };

type UpdateChunk = {
	changeContext?: string;
	oldLines: string[];
	newLines: string[];
	isEndOfFile: boolean;
};

type FileSnapshot = {
	path: string;
	absolutePath: string;
	original: string | null;
	current: string | null;
	originalFormat?: TextFormat;
	currentFormat?: TextFormat;
	forceWrite: boolean;
	writeAsAdd: boolean;
	renderChange?: RenderChange | null;
};

type TextFormat = {
	bom: string;
	ending: "\r\n" | "\n";
};

type RenderChange = {
	label: string;
	oldText: string;
	newText: string;
	showDiff?: boolean;
};

type Preview =
	| {
			diff: string;
			files: string[];
			added: number;
			removed: number;
			firstChangedLine?: number;
	  }
	| { error: string };

type RenderContext<TState> = {
	state: TState;
	cwd: string;
	invalidate: () => void;
	argsComplete: boolean;
	isError: boolean;
	args?: unknown;
	lastComponent?: Component;
};

type EditCallRenderComponent = Box & {
	preview?: Preview;
	previewArgsKey?: string;
	previewPending?: boolean;
	settledError?: boolean;
};

type EditRenderState = {
	callComponent?: EditCallRenderComponent;
};

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw new Error("Operation aborted");
}

function detectLineEnding(content: string): "\r\n" | "\n" {
	const crlfIndex = content.indexOf("\r\n");
	const lfIndex = content.indexOf("\n");
	if (lfIndex === -1 || crlfIndex === -1) return "\n";
	return crlfIndex < lfIndex ? "\r\n" : "\n";
}

function normalizeToLF(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function restoreLineEndings(text: string, ending: "\r\n" | "\n"): string {
	return ending === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
}

function normalizeForFuzzyMatch(text: string): string {
	return text
		.normalize("NFKC")
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n")
		.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
		.replace(/[\u201C\u201D\u201E\u201F]/g, '"')
		.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
		.replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");
}

function stripBom(content: string): { bom: string; text: string } {
	return content.startsWith("\uFEFF")
		? { bom: "\uFEFF", text: content.slice(1) }
		: { bom: "", text: content };
}

function normalizePath(path: string): string {
	const trimmed = path.trim();
	if (!trimmed) throw new Error("File path cannot be empty.");
	return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

function resolveToCwd(cwd: string, path: string): string {
	const normalized = normalizePath(path);
	return isAbsolute(normalized)
		? resolvePath(normalized)
		: resolvePath(cwd, normalized);
}

async function maybeReadSnapshot(
	workspace: Workspace,
	absolutePath: string,
): Promise<{ text: string; format: TextFormat } | null> {
	if (!(await workspace.exists(absolutePath))) return null;
	const { bom, text } = stripBom(await workspace.readText(absolutePath));
	return {
		text: normalizeToLF(text),
		format: { bom, ending: detectLineEnding(text) },
	};
}

async function readExistingNormalized(
	workspace: Workspace,
	path: string,
	absolutePath: string,
): Promise<string> {
	try {
		const content = await workspace.readText(absolutePath);
		return normalizeToLF(stripBom(content).text);
	} catch (error: any) {
		const code =
			error && typeof error === "object" && "code" in error
				? ` (${error.code})`
				: "";
		throw new Error(`Could not read ${path}${code}.`);
	}
}

function parseUpdateChunk(
	lines: string[],
	startIndex: number,
	lastContentLine: number,
	allowMissingContext: boolean,
): { chunk: UpdateChunk; nextIndex: number } {
	let index = startIndex;
	let changeContext: string | undefined;
	const first = lines[index].trimEnd();

	if (first === "@@") {
		index++;
	} else if (first.startsWith("@@ ")) {
		changeContext = first.slice(3);
		index++;
	} else if (!allowMissingContext) {
		throw new Error(
			`Expected update hunk to start with @@ context marker, got: '${lines[index]}'`,
		);
	}

	const oldLines: string[] = [];
	const newLines: string[] = [];
	let parsed = 0;
	let isEndOfFile = false;

	while (index <= lastContentLine) {
		const raw = lines[index];
		const trimmed = raw.trimEnd();
		if (trimmed === "*** End of File") {
			if (parsed === 0) throw new Error("Update hunk does not contain any lines");
			isEndOfFile = true;
			index++;
			break;
		}
		if (
			parsed > 0 &&
			(trimmed.startsWith("@@") || trimmed.startsWith("*** "))
		) {
			break;
		}
		if (raw.length === 0) {
			oldLines.push("");
			newLines.push("");
			parsed++;
			index++;
			continue;
		}

		const marker = raw[0];
		const body = raw.slice(1);
		if (marker === " ") {
			oldLines.push(body);
			newLines.push(body);
		} else if (marker === "-") {
			oldLines.push(body);
		} else if (marker === "+") {
			newLines.push(body);
		} else if (parsed === 0) {
			throw new Error(
				`Unexpected line found in update hunk: '${raw}'. Every line should start with ' ', '+', or '-'.`,
			);
		} else {
			break;
		}
		parsed++;
		index++;
	}

	if (parsed === 0) throw new Error("Update hunk does not contain any lines");
	return {
		chunk: { changeContext, oldLines, newLines, isEndOfFile },
		nextIndex: index,
	};
}

function parsePatch(patchText: string): PatchOperation[] {
	const lines = normalizeToLF(patchText).trim().split("\n");
	if (lines.length < 2) throw new Error("Patch is empty or invalid");
	if (lines[0].trim() !== "*** Begin Patch") {
		throw new Error("The first line of the patch must be '*** Begin Patch'");
	}
	if (lines[lines.length - 1].trim() !== "*** End Patch") {
		throw new Error("The last line of the patch must be '*** End Patch'");
	}

	const operations: PatchOperation[] = [];
	let index = 1;
	const lastContentLine = lines.length - 2;
	while (index <= lastContentLine) {
		if (lines[index].trim() === "") {
			index++;
			continue;
		}

		const line = lines[index].trim();
		if (line.startsWith("*** Add File: ")) {
			const path = normalizePath(line.slice("*** Add File: ".length));
			index++;
			const contentLines: string[] = [];
			while (index <= lastContentLine) {
				const next = lines[index];
				if (next.trim().startsWith("*** ")) break;
				if (!next.startsWith("+")) {
					throw new Error(
						`Invalid add-file line '${next}'. Add file lines must start with '+'`,
					);
				}
				contentLines.push(next.slice(1));
				index++;
			}
			operations.push({
				kind: "add",
				path,
				contents:
					contentLines.length > 0 ? `${contentLines.join("\n")}\n` : "",
			});
			continue;
		}

		if (line.startsWith("*** Delete File: ")) {
			operations.push({
				kind: "delete",
				path: normalizePath(line.slice("*** Delete File: ".length)),
			});
			index++;
			continue;
		}

		if (line.startsWith("*** Update File: ")) {
			const path = normalizePath(line.slice("*** Update File: ".length));
			index++;
			let movePath: string | undefined;
			if (
				index <= lastContentLine &&
				lines[index].trim().startsWith("*** Move to: ")
			) {
				movePath = normalizePath(
					lines[index].trim().slice("*** Move to: ".length),
				);
				index++;
			}

			const chunks: UpdateChunk[] = [];
			while (index <= lastContentLine) {
				if (lines[index].trim() === "") {
					index++;
					continue;
				}
				if (lines[index].trim().startsWith("*** ")) break;
				const parsed = parseUpdateChunk(
					lines,
					index,
					lastContentLine,
					chunks.length === 0,
				);
				chunks.push(parsed.chunk);
				index = parsed.nextIndex;
			}
			if (chunks.length === 0) {
				throw new Error(`Update file hunk for path '${path}' is empty`);
			}
			operations.push({ kind: "update", path, movePath, chunks });
			continue;
		}

		throw new Error(
			`'${line}' is not a valid hunk header. Valid headers: '*** Add File:', '*** Delete File:', '*** Update File:'`,
		);
	}

	if (operations.length === 0) {
		throw new Error("Patch must contain at least one file operation");
	}
	return operations;
}

function seekSequence(
	lines: string[],
	pattern: string[],
	start: number,
	eof = false,
): number | undefined {
	if (pattern.length === 0) return start;
	if (pattern.length > lines.length) return undefined;
	const searchStart =
		eof && lines.length >= pattern.length
			? lines.length - pattern.length
			: Math.max(0, start);
	const searchEnd = lines.length - pattern.length;
	const passes = [
		(a: string, b: string) => a === b,
		(a: string, b: string) => a.trimEnd() === b.trimEnd(),
		(a: string, b: string) => a.trim() === b.trim(),
		(a: string, b: string) =>
			normalizeForFuzzyMatch(a).trim() ===
			normalizeForFuzzyMatch(b).trim(),
	];

	for (const equal of passes) {
		for (let index = searchStart; index <= searchEnd; index++) {
			let matches = true;
			for (let patternIndex = 0; patternIndex < pattern.length; patternIndex++) {
				if (!equal(lines[index + patternIndex], pattern[patternIndex])) {
					matches = false;
					break;
				}
			}
			if (matches) return index;
		}
	}
	return undefined;
}

function deriveUpdatedContent(
	filePath: string,
	currentContent: string,
	chunks: UpdateChunk[],
): string {
	const originalLines = currentContent.split("\n");
	if (originalLines[originalLines.length - 1] === "") originalLines.pop();
	const replacements: Array<[number, number, string[]]> = [];
	let lineIndex = 0;

	for (const chunk of chunks) {
		if (chunk.changeContext !== undefined) {
			const contextIndex = seekSequence(
				originalLines,
				[chunk.changeContext],
				lineIndex,
			);
			if (contextIndex === undefined) {
				throw new Error(
					`Failed to find context '${chunk.changeContext}' in ${filePath}`,
				);
			}
			lineIndex = contextIndex + 1;
		}
		if (chunk.oldLines.length === 0) {
			replacements.push([originalLines.length, 0, [...chunk.newLines]]);
			continue;
		}

		let pattern = chunk.oldLines;
		let newSlice = chunk.newLines;
		let found = seekSequence(
			originalLines,
			pattern,
			lineIndex,
			chunk.isEndOfFile,
		);
		if (found === undefined && pattern[pattern.length - 1] === "") {
			pattern = pattern.slice(0, -1);
			if (newSlice[newSlice.length - 1] === "") {
				newSlice = newSlice.slice(0, -1);
			}
			found = seekSequence(
				originalLines,
				pattern,
				lineIndex,
				chunk.isEndOfFile,
			);
		}
		if (found === undefined) {
			throw new Error(
				`Failed to find expected lines in ${filePath}:\n${chunk.oldLines.join("\n")}`,
			);
		}
		replacements.push([found, pattern.length, [...newSlice]]);
		lineIndex = found + pattern.length;
	}

	const newLines = [...originalLines];
	for (const [start, oldLength, newSegment] of replacements.sort(
		(a, b) => b[0] - a[0],
	)) {
		newLines.splice(start, oldLength, ...newSegment);
	}
	if (newLines[newLines.length - 1] !== "") newLines.push("");
	return newLines.join("\n");
}

function createSnapshotStore(workspace: Workspace, cwd: string) {
	const snapshots = new Map<string, FileSnapshot>();
	const ordered: FileSnapshot[] = [];

	return {
		async get(path: string): Promise<FileSnapshot> {
			const absolutePath = resolveToCwd(cwd, path);
			let snapshot = snapshots.get(absolutePath);
			if (!snapshot) {
				const existing = await maybeReadSnapshot(workspace, absolutePath);
				snapshot = {
					path,
					absolutePath,
					original: existing?.text ?? null,
					current: existing?.text ?? null,
					originalFormat: existing?.format,
					currentFormat: existing?.format,
					forceWrite: false,
					writeAsAdd: false,
					renderChange: undefined,
				};
				snapshots.set(absolutePath, snapshot);
				ordered.push(snapshot);
			}
			return snapshot;
		},
		collectChanges(): PlannedFileChange[] {
			const changes: PlannedFileChange[] = [];
			for (const {
				path,
				absolutePath,
				original,
				current,
				originalFormat,
				currentFormat,
				forceWrite,
				writeAsAdd,
				renderChange,
			} of ordered) {
				const formatChanged =
					originalFormat?.bom !== currentFormat?.bom ||
					originalFormat?.ending !== currentFormat?.ending;
				if (original === current && !formatChanged && !forceWrite) continue;
				if (original === null && current !== null) {
					changes.push({
						kind: "add",
						path,
						absolutePath,
						oldText: "",
						newText: current,
						oldExists: false,
						outputFormat: currentFormat,
						renderChange:
							renderChange ?? {
								label: `Add: ${path}`,
								oldText: "",
								newText: current,
							},
					});
				} else if (original !== null && current === null) {
					changes.push({
						kind: "delete",
						path,
						absolutePath,
						oldText: original,
						newText: "",
						oldExists: true,
						renderChange:
							renderChange === undefined
								? {
										label: `Delete: ${path}`,
										oldText: original,
										newText: "",
									}
								: renderChange,
					});
				} else if (original !== null && current !== null) {
					changes.push({
						kind: writeAsAdd
							? "add"
							: original.length === 0
								? "write"
								: "update",
						path,
						absolutePath,
						oldText: original,
						newText: current,
						oldExists: true,
						outputFormat: currentFormat,
						renderChange:
							renderChange ?? {
								label: `${writeAsAdd ? "Add" : "Edit"}: ${path}`,
								oldText: original,
								newText: current,
							},
					});
				}
			}
			if (changes.length === 0) throw new Error("The patch produced no changes.");
			return changes.sort(
				(a, b) => Number(a.kind === "delete") - Number(b.kind === "delete"),
			);
		},
	};
}

async function buildPlan(
	text: string,
	cwd: string,
	workspace: Workspace,
): Promise<PlannedFileChange[]> {
	const operations = parsePatch(text);
	const store = createSnapshotStore(workspace, cwd);

	for (const operation of operations) {
		const snapshot = await store.get(operation.path);
		if (operation.kind === "add") {
			const previousContent = snapshot.current;
			const contents = normalizeToLF(operation.contents);
			snapshot.current = contents.endsWith("\n")
				? contents
				: `${contents}\n`;
			snapshot.currentFormat = { bom: "", ending: "\n" };
			snapshot.forceWrite = true;
			snapshot.writeAsAdd = true;
			snapshot.renderChange = {
				label: `${previousContent === null ? "Add" : "Add (overwrite)"}: ${operation.path}`,
				oldText: previousContent ?? "",
				newText: snapshot.current,
			};
			continue;
		}
		if (operation.kind === "delete") {
			if (snapshot.current === null) {
				throw new Error(
					`Failed to delete ${operation.path}: file does not exist.`,
				);
			}
			const deletedContent = snapshot.current;
			snapshot.current = null;
			snapshot.currentFormat = undefined;
			snapshot.forceWrite = false;
			snapshot.writeAsAdd = false;
			snapshot.renderChange = {
				label: `Delete: ${operation.path}`,
				oldText: deletedContent,
				newText: "",
				showDiff: false,
			};
			continue;
		}
		if (snapshot.current === null) {
			throw new Error(
				`Failed to update ${operation.path}: file does not exist.`,
			);
		}
		const updatedContent = deriveUpdatedContent(
			operation.path,
			snapshot.current,
			operation.chunks,
		);
		if (operation.movePath === undefined) {
			snapshot.current = updatedContent;
			if (snapshot.renderChange) {
				snapshot.renderChange.newText = updatedContent;
			}
			continue;
		}

		const movedFormat = snapshot.currentFormat ?? { bom: "", ending: "\n" };
		const movedFromContent = snapshot.original ?? snapshot.current;
		snapshot.current = null;
		snapshot.currentFormat = undefined;
		snapshot.forceWrite = false;
		snapshot.writeAsAdd = false;
		snapshot.renderChange = null;

		const destination = await store.get(operation.movePath);
		const overwritesDestination = destination.current !== null;
		destination.current = updatedContent;
		destination.currentFormat = movedFormat;
		destination.forceWrite = true;
		destination.writeAsAdd = false;
		destination.renderChange = {
			label: `Move${overwritesDestination ? " (overwrite)" : ""}: ${operation.path} → ${operation.movePath}`,
			oldText: movedFromContent,
			newText: updatedContent,
		};
	}

	return store.collectChanges();
}

async function preflightPlan(
	changes: PlannedFileChange[],
	workspace: Workspace,
	signal?: AbortSignal,
): Promise<void> {
	for (const change of changes) {
		throwIfAborted(signal);
		await workspace.checkWriteAccess(change.absolutePath);
		if (change.kind === "delete") {
			await workspace.checkDeleteAccess(change.absolutePath);
		}
	}
}

function detailsForChange(
	path: string,
	oldText: string,
	newText: string,
): EditDetailsLike {
	const { diff, firstChangedLine } = generateDiffString(oldText, newText);
	return {
		diff,
		patch: generateUnifiedPatch(path, oldText, newText),
		firstChangedLine,
	};
}

async function applyChange(
	change: PlannedFileChange,
	workspace: Workspace,
	signal?: AbortSignal,
): Promise<EditDetailsLike> {
	return withFileMutationQueue(change.absolutePath, async () => {
		throwIfAborted(signal);

		if (change.kind === "delete") {
			await workspace.checkWriteAccess(change.absolutePath);
			await workspace.checkDeleteAccess(change.absolutePath);
			const current = await readExistingNormalized(
				workspace,
				change.path,
				change.absolutePath,
			);
			if (current !== change.oldText) {
				throw new Error(
					`Could not delete ${change.path}: file changed since preflight.`,
				);
			}
			await workspace.deleteFile(change.absolutePath);
			return detailsForChange(change.path, change.oldText, "");
		}

		const current = await maybeReadSnapshot(workspace, change.absolutePath);
		if (
			(change.oldExists && current?.text !== change.oldText) ||
			(!change.oldExists && current !== null)
		) {
			throw new Error(
				`Could not edit ${change.path}: file changed since preflight.`,
			);
		}
		const format = change.outputFormat ?? { bom: "", ending: "\n" };
		const finalContent =
			format.bom + restoreLineEndings(change.newText, format.ending);
		await workspace.writeText(change.absolutePath, finalContent);
		throwIfAborted(signal);
		return detailsForChange(change.path, change.oldText, change.newText);
	});
}

async function applyPlan(
	changes: PlannedFileChange[],
	workspace: Workspace,
	signal?: AbortSignal,
): Promise<EditDetails> {
	const files: EditDetails["files"] = [];
	for (const change of changes) {
		throwIfAborted(signal);
		files.push({
			path: change.path,
			kind: change.kind,
			details: await applyChange(change, workspace, signal),
		});
	}
	return {
		...combineDetails(files),
		diff: formatChangesDiff(changes),
		...summarizeChanges(changes),
	};
}

function combineDetails(
	files: EditDetails["files"],
): Omit<EditDetails, "added" | "removed"> {
	const diff =
		files.length === 1
			? files[0].details.diff
			: files
					.map((file) => `File: ${file.path}\n${file.details.diff}`)
					.join("\n\n");
	const patch = files.map((file) => file.details.patch).join("\n");
	const firstChangedLine = files.find(
		(file) => file.details.firstChangedLine !== undefined,
	)?.details.firstChangedLine;
	return { diff, patch, firstChangedLine, files };
}

function formatSummary(details: EditDetails): string {
	if (details.files.length === 1) {
		const file = details.files[0];
		const verb =
			file.kind === "add"
				? "Added"
				: file.kind === "delete"
					? "Deleted"
					: "Edited";
		return `${verb} ${file.path}.`;
	}
	return `Applied patch to ${details.files.length} file(s).\n${details.files
		.map((file, index) => `${index + 1}. ${file.kind} ${file.path}`)
		.join("\n")}`;
}

function uniquePaths(paths: string[]): string[] {
	return Array.from(new Set(paths));
}

function countChangedLines(diff: string): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const line of diff.split("\n")) {
		if (/^\+\s*\d+\s/.test(line)) added++;
		else if (/^-\s*\d+\s/.test(line)) removed++;
	}
	return { added, removed };
}

function summarizeChanges(
	changes: PlannedFileChange[],
): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const change of changes) {
		if (change.renderChange === null) continue;
		const counts = countChangedLines(
			generateDiffString(
				change.renderChange.oldText,
				change.renderChange.newText,
			).diff,
		);
		added += counts.added;
		removed += counts.removed;
	}
	return { added, removed };
}

function formatChangesDiff(changes: PlannedFileChange[]): string {
	return changes
		.filter(
			(change): change is PlannedFileChange & { renderChange: RenderChange } =>
				change.renderChange !== null,
		)
		.map(({ renderChange }) => {
			if (renderChange.showDiff === false) return renderChange.label;
			const diff = generateDiffString(
				renderChange.oldText,
				renderChange.newText,
			).diff;
			return diff ? `${renderChange.label}\n${diff}` : renderChange.label;
		})
		.join("\n\n");
}

function previewForChanges(changes: PlannedFileChange[]): Preview {
	const details = combineDetails(
		changes.map((change) => ({
			path: change.path,
			kind: change.kind,
			details: detailsForChange(
				change.path,
				change.oldText,
				change.newText,
			),
		})),
	);
	const counts = summarizeChanges(changes);
	return {
		diff: formatChangesDiff(changes),
		files: uniquePaths(changes.map((change) => change.path)),
		...counts,
		firstChangedLine: details.firstChangedLine,
	};
}

function shortenPath(path: string): string {
	const home = homedir();
	return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function linkPath(styledText: string, rawPath: string, cwd: string): string {
	if (!getCapabilities().hyperlinks) return styledText;
	return hyperlink(
		styledText,
		pathToFileURL(resolveToCwd(cwd, rawPath)).href,
	);
}

function getPatchRenderMeta(
	text: string | undefined,
): { files: string[]; operationSummary: string } | undefined {
	if (!text) return undefined;
	try {
		const operations = parsePatch(text);
		const counts = new Map<string, number>();
		for (const operation of operations) {
			const kind =
				operation.kind === "update"
					? operation.movePath === undefined
						? "edit"
						: "move"
					: operation.kind;
			counts.set(kind, (counts.get(kind) ?? 0) + 1);
		}
		return {
			files: uniquePaths(operations.map((operation) => operation.path)),
			operationSummary: ["add", "edit", "move", "delete"]
				.map((kind) => {
					const count = counts.get(kind);
					return count ? `${count} ${kind}` : undefined;
				})
				.filter((part): part is string => part !== undefined)
				.join(", "),
		};
	} catch {
		return undefined;
	}
}

function extractPatchPaths(text: string | undefined): string[] | undefined {
	if (!text) return undefined;
	const meta = getPatchRenderMeta(text);
	if (meta) return meta.files;

	const paths: string[] = [];
	for (const raw of normalizeToLF(text).split("\n")) {
		const line = raw.trim();
		for (const prefix of [
			"*** Add File: ",
			"*** Delete File: ",
			"*** Update File: ",
		]) {
			if (!line.startsWith(prefix)) continue;
			const path = line.slice(prefix.length).trim();
			if (path) paths.push(path.replace(/^@/, ""));
			break;
		}
	}
	const unique = uniquePaths(paths);
	return unique.length > 0 ? unique : undefined;
}

function formatPathLabel(
	paths: string[] | undefined,
	theme: any,
	cwd: string,
): string {
	if (!paths || paths.length === 0) return theme.fg("toolOutput", "...");
	if (paths.length > 1) return theme.fg("accent", `${paths.length} files`);
	const rawPath = paths[0];
	return linkPath(theme.fg("accent", shortenPath(rawPath)), rawPath, cwd);
}

function formatEditCall(
	text: string | undefined,
	preview: Preview | undefined,
	theme: any,
	cwd: string,
): string {
	const title = theme.fg("toolTitle", theme.bold("edit"));
	const meta = getPatchRenderMeta(text);
	const paths =
		meta?.files ??
		(preview && !("error" in preview) ? preview.files : extractPatchPaths(text));
	const operations = meta?.operationSummary
		? ` ${theme.fg("toolOutput", meta.operationSummary)}`
		: "";
	const counts =
		preview && !("error" in preview)
			? ` ${theme.fg("toolDiffAdded", `+${preview.added}`)} ${theme.fg("toolDiffRemoved", `-${preview.removed}`)}`
			: "";
	return `${title} ${formatPathLabel(paths, theme, cwd)}${operations}${counts}`;
}

function createCallComponent(): EditCallRenderComponent {
	return Object.assign(new Box(1, 1, (text: string) => text), {
		preview: undefined as Preview | undefined,
		previewArgsKey: undefined as string | undefined,
		previewPending: false,
		settledError: false,
	});
}

function getCallComponent(
	state: EditRenderState,
	lastComponent: unknown,
): EditCallRenderComponent {
	if (lastComponent instanceof Box) {
		const component = lastComponent as EditCallRenderComponent;
		state.callComponent = component;
		return component;
	}
	if (state.callComponent) return state.callComponent;
	const component = createCallComponent();
	state.callComponent = component;
	return component;
}

function getHeaderBg(
	preview: Preview | undefined,
	settledError: boolean | undefined,
	theme: any,
): (text: string) => string {
	if (preview) {
		return "error" in preview
			? (text) => theme.bg("toolErrorBg", text)
			: (text) => theme.bg("toolSuccessBg", text);
	}
	if (settledError) return (text) => theme.bg("toolErrorBg", text);
	return (text) => theme.bg("toolPendingBg", text);
}

function setPreview(
	component: EditCallRenderComponent,
	preview: Preview,
	argsKey: string | undefined,
): boolean {
	const current = component.preview;
	const changed =
		current === undefined ||
		("error" in current && "error" in preview
			? current.error !== preview.error
			: "error" in current !== "error" in preview) ||
		(!("error" in current) &&
			!("error" in preview) &&
			(current.diff !== preview.diff ||
				current.added !== preview.added ||
				current.removed !== preview.removed ||
				current.firstChangedLine !== preview.firstChangedLine ||
				current.files.join("\0") !== preview.files.join("\0")));
	component.preview = preview;
	component.previewArgsKey = argsKey;
	component.previewPending = false;
	return changed;
}

function requestPreview(
	component: EditCallRenderComponent,
	text: string,
	argsKey: string,
	cwd: string,
	workspace: Workspace,
	invalidate: () => void,
): void {
	if (component.preview || component.previewPending) return;
	component.previewPending = true;
	void buildPlan(text, cwd, workspace)
		.then(previewForChanges)
		.catch(
			(error): Preview => ({
				error: error instanceof Error ? error.message : String(error),
			}),
		)
		.then((preview) => {
			if (component.previewArgsKey !== argsKey) return;
			setPreview(component, preview, argsKey);
			invalidate();
		});
}

function buildCallComponent(
	component: EditCallRenderComponent,
	text: string | undefined,
	theme: any,
	cwd: string,
	showPreview: boolean,
): EditCallRenderComponent {
	component.setBgFn(getHeaderBg(component.preview, component.settledError, theme));
	component.clear();
	component.addChild(new Text(formatEditCall(text, component.preview, theme, cwd), 0, 0));
	if (!showPreview || !component.preview) return component;

	const body =
		"error" in component.preview
			? theme.fg("error", component.preview.error)
			: renderDiff(component.preview.diff);
	component.addChild(new Spacer(1));
	component.addChild(new Text(body, 0, 0));
	return component;
}

function formatResult(
	preview: Preview | undefined,
	result: { content: ToolContent; details?: EditDetails },
	theme: any,
	isError: boolean,
): string | undefined {
	const previewDiff = preview && !("error" in preview) ? preview.diff : undefined;
	const previewError = preview && "error" in preview ? preview.error : undefined;
	if (isError) {
		const errorText = result.content.map((item) => item.text || "").join("\n");
		if (!errorText || errorText === previewError) return undefined;
		return theme.fg("error", errorText);
	}
	const resultDiff = result.details?.diff;
	return resultDiff && resultDiff !== previewDiff
		? renderDiff(resultDiff)
		: undefined;
}

export function createEditOverride(sandbox: SandboxAPI) {
	return {
		description: TOOL_DESCRIPTION,
		promptSnippet: TOOL_PROMPT_SNIPPET,
		promptGuidelines: TOOL_PROMPT_GUIDELINES,
		parameters: editSchema,
		constrainedSampling: {
			type: "grammar" as const,
			variants: { openai_lark: APPLY_PATCH_LARK_GRAMMAR },
		},
		renderShell: "self" as const,

		async execute(
			_toolCallId: string,
			params: EditParams,
			signal: AbortSignal | undefined,
			_onUpdate: unknown,
			ctx: { cwd: string },
		) {
			const text = params.text;
			if (typeof text !== "string" || text.trim() === "") {
				throw new Error("edit requires a non-empty apply patch payload.");
			}
			const cwd = sandbox.translatePath(ctx.cwd);
			const workspace = createRealWorkspace(sandbox.getOps().edit);
			const changes = await buildPlan(text, cwd, workspace);
			try {
				await preflightPlan(changes, workspace, signal);
			} catch (error: any) {
				throw new Error(
					`Preflight failed before mutating files.\n${error?.message ?? String(error)}`,
				);
			}
			const details = await applyPlan(changes, workspace, signal);
			return {
				content: [{ type: "text" as const, text: formatSummary(details) }],
				details,
			};
		},

		renderCall(
			args: unknown,
			theme: any,
			context: RenderContext<EditRenderState>,
		) {
			const component = getCallComponent(context.state, context.lastComponent);
			const text =
				args && typeof args === "object" &&
				typeof (args as { text?: unknown }).text === "string"
					? (args as { text: string }).text
					: undefined;
			const key = text === undefined ? undefined : `${context.cwd}\0${text}`;
			if (component.previewArgsKey !== key) {
				component.preview = undefined;
				component.previewArgsKey = key;
				component.previewPending = false;
				component.settledError = false;
			}

			const mode = getToolViewMode();
			if (
				mode !== "minimal" &&
				context.argsComplete &&
				text &&
				key
			) {
				requestPreview(
					component,
					text,
					key,
					sandbox.translatePath(context.cwd),
					createRealWorkspace(sandbox.getOps().edit),
					context.invalidate,
				);
			}

			return buildCallComponent(
				component,
				text,
				theme,
				context.cwd,
				mode !== "minimal",
			);
		},

		renderResult(
			result: { content: ToolContent; details?: EditDetails },
			_options: unknown,
			theme: any,
			context: RenderContext<EditRenderState>,
		) {
			const component = context.state.callComponent;
			const text =
				context.args && typeof context.args === "object" &&
				typeof (context.args as { text?: unknown }).text === "string"
					? (context.args as { text: string }).text
					: undefined;
			const key = text === undefined ? undefined : `${context.cwd}\0${text}`;
			let changed = false;

			if (component) {
				if (!context.isError && result.details?.diff) {
					changed =
						setPreview(
							component,
							{
								diff: result.details.diff,
								files: uniquePaths(
									result.details.files.map((file) => file.path),
								),
								added: result.details.added,
								removed: result.details.removed,
								firstChangedLine: result.details.firstChangedLine,
							},
							key,
						) || changed;
				}
				if (component.settledError !== context.isError) {
					component.settledError = context.isError;
					changed = true;
				}
				if (changed) {
					buildCallComponent(
						component,
						text,
						theme,
						context.cwd,
						getToolViewMode() !== "minimal",
					);
				}
			}

			const output =
				getToolViewMode() === "minimal"
					? undefined
					: formatResult(
							component?.preview,
							result,
							theme,
							context.isError,
						);
			const resultComponent =
				(context.lastComponent as Container | undefined) ?? new Container();
			resultComponent.clear();
			if (!output) return resultComponent;
			resultComponent.addChild(new Spacer(1));
			resultComponent.addChild(new Text(output, 1, 0));
			return resultComponent;
		},
	};
}
