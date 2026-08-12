import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createEditOverride } from "./override-edit.ts";
import type { SandboxAPI, SandboxEditOperations } from "./sandbox-shared.ts";
import { setToolViewMode } from "./tool-view-mode.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(path.join(tmpdir(), "pi-edit-test-"));
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function createSandbox(
	editOps?: SandboxEditOperations,
	translatePath = (value: string) => value,
): SandboxAPI {
	return {
		isActive: () => editOps !== undefined,
		getOps: () => (editOps ? { edit: editOps } : {}),
		translatePath,
		getSharedTempDir: (name) => {
			const dir = path.join(tmpdir(), name);
			return { hostPath: dir, agentPath: dir };
		},
	};
}

function createLocalEdit(cwd: string) {
	const edit = createEditOverride(createSandbox());
	const ctx = { cwd } as ExtensionContext;
	return (text: string) =>
		edit.execute("test", { text }, undefined, undefined, ctx);
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

test("edit exposes only one required patch text field", () => {
	const edit = createEditOverride(createSandbox());
	const schema = edit.parameters as any;

	assert.deepEqual(schema.required, ["text"]);
	assert.deepEqual(Object.keys(schema.properties), ["text"]);
	assert.equal(schema.additionalProperties, false);
	assert.equal("prepareArguments" in edit, false);
	assert.match(edit.description, /Codex-style patch/);
	assert.doesNotMatch(edit.description, /marked row edit script/);
	assert.equal(edit.renderShell, "self");
	assert.equal(edit.constrainedSampling.type, "grammar");
	assert.match(
		edit.constrainedSampling.variants.openai_lark,
		/^start: begin_patch file_operation\+ end_patch/m,
	);
	assert.match(
		edit.constrainedSampling.variants.openai_lark,
		/"\*\*\* Update File: "/,
	);
	assert.match(
		edit.constrainedSampling.variants.openai_lark,
		/"\*\*\* Move to: "/,
	);
});

test("edit rejects row scripts", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "old\n", "utf-8");
		const edit = createLocalEdit(dir);

		await assert.rejects(
			edit("[a.txt]\n@REPLACE\n-old\n+new"),
			/The first line of the patch must be '\*\*\* Begin Patch'/,
		);
		assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "old\n");
	});
});

test("patch updates multiple files and hunks", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "one\ntwo\nthree\nfour\n", "utf-8");
		await writeFile(path.join(dir, "b.txt"), "red\nblue\n", "utf-8");
		const edit = createLocalEdit(dir);

		const result = await edit([
			"*** Begin Patch",
			"*** Update File: a.txt",
			"@@",
			" one",
			"-two",
			"+TWO",
			"@@",
			" three",
			"-four",
			"+FOUR",
			"*** Update File: b.txt",
			"@@",
			"-red",
			"+RED",
			" blue",
			"*** End Patch",
		].join("\n"));

		assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "one\nTWO\nthree\nFOUR\n");
		assert.equal(await readFile(path.join(dir, "b.txt"), "utf-8"), "RED\nblue\n");
		assert.equal(result.details.files.length, 2);
		assert.match(result.details.diff, /^Edit: a\.txt/m);
		assert.match(result.details.diff, /^Edit: b\.txt/m);
	});
});

test("patch adds and deletes files", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "gone.txt"), "gone\n", "utf-8");
		const edit = createLocalEdit(dir);

		const result = await edit([
			"*** Begin Patch",
			"*** Add File: nested/new.txt",
			"+new",
			"+file",
			"*** Delete File: gone.txt",
			"*** End Patch",
		].join("\n"));

		assert.equal(await readFile(path.join(dir, "nested/new.txt"), "utf-8"), "new\nfile\n");
		assert.equal(await exists(path.join(dir, "gone.txt")), false);
	});
});

test("patch add overwrites an existing file", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "\uFEFFkeep\r\n", "utf-8");
		const edit = createLocalEdit(dir);

		const result = await edit(
			"*** Begin Patch\n*** Add File: a.txt\n+replace\n*** End Patch",
		);
		assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "replace\n");
		assert.match(result.details.diff, /^Add \(overwrite\): a\.txt/m);
	});
});

test("patch moves and updates a file", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "old.txt"), "\uFEFFold\r\n", "utf-8");
		const edit = createLocalEdit(dir);

		await edit([
			"*** Begin Patch",
			"*** Update File: old.txt",
			"*** Move to: nested/new.txt",
			"@@",
			"-old",
			"+new",
			"*** End Patch",
		].join("\n"));

		assert.equal(await exists(path.join(dir, "old.txt")), false);
		assert.equal(
			await readFile(path.join(dir, "nested/new.txt"), "utf-8"),
			"\uFEFFnew\r\n",
		);
	});
});

test("patch move overwrites an existing destination", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "old.txt"), "old\n", "utf-8");
		await writeFile(path.join(dir, "new.txt"), "destination\n", "utf-8");
		const edit = createLocalEdit(dir);

		const result = await edit([
			"*** Begin Patch",
			"*** Update File: old.txt",
			"*** Move to: new.txt",
			"@@",
			"-old",
			"+moved",
			"*** End Patch",
		].join("\n"));

		assert.equal(await exists(path.join(dir, "old.txt")), false);
		assert.equal(await readFile(path.join(dir, "new.txt"), "utf-8"), "moved\n");
		assert.match(
			result.details.diff,
			/^Move \(overwrite\): old\.txt → new\.txt/m,
		);
	});
});

test("patch update uses fuzzy line matching", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "const value = “old”;   \n", "utf-8");
		const edit = createLocalEdit(dir);

		await edit([
			"*** Begin Patch",
			"*** Update File: a.txt",
			"@@",
			"-const value = \"old\";",
			"+const value = \"new\";",
			"*** End Patch",
		].join("\n"));

		assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "const value = \"new\";\n");
	});
});

test("patch planning failure leaves every file unchanged", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "one\n", "utf-8");
		const edit = createLocalEdit(dir);

		await assert.rejects(
			edit([
				"*** Begin Patch",
				"*** Update File: a.txt",
				"@@",
				"-one",
				"+ONE",
				"*** Update File: missing.txt",
				"@@",
				"-missing",
				"+changed",
				"*** End Patch",
			].join("\n")),
			/file does not exist/,
		);
		assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "one\n");
	});
});

test("patch updates preserve a BOM and CRLF line endings", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "\uFEFFone\r\ntwo\r\n", "utf-8");
		const edit = createLocalEdit(dir);

		await edit([
			"*** Begin Patch",
			"*** Update File: a.txt",
			"@@",
			" one",
			"-two",
			"+TWO",
			"*** End Patch",
		].join("\n"));

		assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "\uFEFFone\r\nTWO\r\n");
	});
});

test("sandbox edit operations receive translated paths", async () => {
	const files = new Map<string, string>([["/guest/project/a.txt", "one\n"]]);
	const checked: string[] = [];
	const missing = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });
	const ops: SandboxEditOperations = {
		async readFile(filePath) {
			const content = files.get(filePath);
			if (content === undefined) throw missing();
			return Buffer.from(content);
		},
		async writeFile(filePath, content) {
			files.set(filePath, content);
		},
		async mkdir() {},
		async deleteFile(filePath) {
			if (!files.delete(filePath)) throw missing();
		},
		async exists(filePath) {
			return files.has(filePath);
		},
		async checkWriteAccess(filePath) {
			checked.push(filePath);
		},
		async checkDeleteAccess(filePath) {
			checked.push(filePath);
		},
	};
	const sandbox = createSandbox(ops, (value) =>
		value.replace("/host/project", "/guest/project"),
	);
	const edit = createEditOverride(sandbox);

	await edit.execute(
		"test",
		{
			text: "*** Begin Patch\n*** Update File: a.txt\n@@\n-one\n+ONE\n*** End Patch",
		},
		undefined,
		undefined,
		{ cwd: "/host/project" },
	);

	assert.equal(files.get("/guest/project/a.txt"), "ONE\n");
	assert.ok(checked.every((filePath) => filePath === "/guest/project/a.txt"));
});

test("minimal mode stays header-only and streamed arguments do not build previews", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "old\n", "utf-8");
		const args = {
			text: "*** Begin Patch\n*** Update File: a.txt\n@@\n-old\n+new\n*** End Patch",
		};
		const theme = {
			fg: (_color: string, text: string) => text,
			bold: (text: string) => text,
			bg: (_color: string, text: string) => text,
		};
		let invalidations = 0;
		const context = (state: Record<string, unknown>, argsComplete: boolean) => ({
			state,
			cwd: dir,
			invalidate: () => invalidations++,
			argsComplete,
			isError: false,
			args,
		});

		try {
			setToolViewMode("minimal");
			const edit = createEditOverride(createSandbox());
			const state = {};
			const call = edit.renderCall(args, theme, context(state, true));
			await new Promise((resolve) => setImmediate(resolve));
			assert.equal(invalidations, 0);
			assert.doesNotMatch(call.render(120).join("\n"), /[-+]1 (?:old|new)/);

			setToolViewMode("condensed");
			invalidations = 0;
			const streamedEdit = createEditOverride(createSandbox());
			streamedEdit.renderCall(args, theme, context({}, false));
			await new Promise((resolve) => setImmediate(resolve));
			assert.equal(invalidations, 0);
		} finally {
			setToolViewMode("minimal");
		}
	});
});

test("minimal mode headline shows colored line change counts after editing", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "old\n", "utf-8");
		const args = {
			text: "*** Begin Patch\n*** Update File: a.txt\n@@\n-old\n+new\n*** End Patch",
		};
		const theme = {
			fg: (color: string, text: string) =>
				color === "toolDiffAdded"
					? `GREEN(${text})`
					: color === "toolDiffRemoved"
						? `RED(${text})`
						: text,
			bold: (text: string) => text,
			bg: (_color: string, text: string) => text,
		};
		const state = {};
		const context = {
			state,
			cwd: dir,
			invalidate: () => {},
			argsComplete: true,
			isError: false,
			args,
		};

		try {
			setToolViewMode("minimal");
			const edit = createEditOverride(createSandbox());
			const call = edit.renderCall(args, theme, context);
			const result = await edit.execute(
				"test",
				args,
				undefined,
				undefined,
				{ cwd: dir },
			);
			edit.renderResult(result, {}, theme, context);

			assert.match(
				call.render(120).join("\n"),
				/edit a\.txt 1 edit GREEN\(\+1\) RED\(-1\)/,
			);
		} finally {
			setToolViewMode("minimal");
		}
	});
});

test("minimal mode headline summarizes patch operation totals", () => {
	const args = {
		text: [
			"*** Begin Patch",
			"*** Add File: added.txt",
			"+added",
			"*** Update File: edited.txt",
			"@@",
			"-old",
			"+new",
			"*** Update File: old.txt",
			"*** Move to: moved.txt",
			"@@",
			"-before",
			"+after",
			"*** Delete File: deleted.txt",
			"*** End Patch",
		].join("\n"),
	};
	const theme = {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		bg: (_color: string, text: string) => text,
	};

	try {
		setToolViewMode("minimal");
		const edit = createEditOverride(createSandbox());
		const call = edit.renderCall(args, theme, {
			state: {},
			cwd: "/project",
			invalidate: () => {},
			argsComplete: true,
			isError: false,
			args,
		});

		assert.match(
			call.render(120).join("\n"),
			/edit 4 files 1 add, 1 edit, 1 move, 1 delete/,
		);
	} finally {
		setToolViewMode("minimal");
	}
});

test("move headline counts only content edits, not the path change", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "old.txt"), "one\ntwo\nthree\n", "utf-8");
		const args = {
			text: [
				"*** Begin Patch",
				"*** Update File: old.txt",
				"*** Move to: new.txt",
				"@@",
				" one",
				"-two",
				"+TWO",
				" three",
				"*** End Patch",
			].join("\n"),
		};
		const theme = {
			fg: (_color: string, text: string) => text,
			bold: (text: string) => text,
			bg: (_color: string, text: string) => text,
		};
		const state = {};
		const context = {
			state,
			cwd: dir,
			invalidate: () => {},
			argsComplete: true,
			isError: false,
			args,
		};

		try {
			setToolViewMode("minimal");
			const edit = createEditOverride(createSandbox());
			const call = edit.renderCall(args, theme, context);
			const result = await edit.execute(
				"test",
				args,
				undefined,
				undefined,
				{ cwd: dir },
			);
			edit.renderResult(result, {}, theme, context);

			assert.match(
				call.render(120).join("\n"),
				/edit old\.txt 1 move \+1 -1/,
			);
		} finally {
			setToolViewMode("minimal");
		}
	});
});

test("path-only move headline shows zero changed lines", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "old.txt"), "unchanged\n", "utf-8");
		const args = {
			text: [
				"*** Begin Patch",
				"*** Update File: old.txt",
				"*** Move to: new.txt",
				"@@",
				" unchanged",
				"*** End Patch",
			].join("\n"),
		};
		const theme = {
			fg: (_color: string, text: string) => text,
			bold: (text: string) => text,
			bg: (_color: string, text: string) => text,
		};
		const state = {};
		const context = {
			state,
			cwd: dir,
			invalidate: () => {},
			argsComplete: true,
			isError: false,
			args,
		};

		try {
			setToolViewMode("minimal");
			const edit = createEditOverride(createSandbox());
			const call = edit.renderCall(args, theme, context);
			const result = await edit.execute(
				"test",
				args,
				undefined,
				undefined,
				{ cwd: dir },
			);
			edit.renderResult(result, {}, theme, context);

			assert.match(
				call.render(120).join("\n"),
				/edit old\.txt 1 move \+0 -0/,
			);
			assert.equal(result.details.diff, "Move: old.txt → new.txt");
		} finally {
			setToolViewMode("minimal");
		}
	});
});

test("expanded diff labels and combines mixed patch operations", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "edit.txt"), "before\nkeep\n", "utf-8");
		await writeFile(path.join(dir, "move-source.txt"), "move before\n", "utf-8");
		await writeFile(path.join(dir, "delete.txt"), "delete me\n", "utf-8");
		const args = {
			text: [
				"*** Begin Patch",
				"*** Add File: added.txt",
				"+added",
				"*** Update File: edit.txt",
				"@@",
				"-before",
				"+after",
				" keep",
				"*** Update File: move-source.txt",
				"*** Move to: moved.txt",
				"@@",
				"-move before",
				"+move after",
				"*** Delete File: delete.txt",
				"*** End Patch",
			].join("\n"),
		};
		const edit = createEditOverride(createSandbox());
		const result = await edit.execute(
			"test",
			args,
			undefined,
			undefined,
			{ cwd: dir },
		);
		const rendered = result.details.diff;

		assert.match(rendered, /Add: added\.txt/);
		assert.match(rendered, /Edit: edit\.txt/);
		assert.match(rendered, /Move: move-source\.txt → moved\.txt/);
		assert.match(rendered, /Delete: delete\.txt/);
		assert.doesNotMatch(rendered, /-1 delete me/);
		assert.doesNotMatch(rendered, /File: /);
	});
});
