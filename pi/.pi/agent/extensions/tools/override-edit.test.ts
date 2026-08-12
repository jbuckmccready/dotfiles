import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createEditOverride } from "./override-edit.ts";
import { setToolViewMode } from "./tool-view-mode.ts";
import type { SandboxAPI, SandboxEditOperations } from "./sandbox-shared.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(path.join(tmpdir(), "pi-edit-test-"));
	try {
		return await fn(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function createSandbox(editOps?: SandboxEditOperations, translatePath = (value: string) => value): SandboxAPI {
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
	return (params: Parameters<typeof edit.execute>[1]) =>
		edit.execute("test", params, undefined, undefined, ctx);
}

function getText(result: Awaited<ReturnType<ReturnType<typeof createLocalEdit>>>): string {
	const entry = result.content[0];
	assert.equal(entry.type, "text");
	return entry.text;
}

async function exists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

test("edit exposes the unified one-text API", () => {
	const edit = createEditOverride(createSandbox());
	const schema = edit.parameters as any;

	assert.deepEqual(schema.required, ["text"]);
	assert.deepEqual(Object.keys(schema.properties), ["text"]);
	assert.equal(schema.additionalProperties, false);
	assert.match(edit.description, /marked row edit script/);
	assert.equal(edit.renderShell, "self");
});

test("edit prepares raw strings and alternate string fields as text", () => {
	const edit = createEditOverride(createSandbox());
	const prepare = edit.prepareArguments;

	assert.deepEqual(prepare("[a.txt]\n@APPEND\n+x"), { text: "[a.txt]\n@APPEND\n+x" });
	assert.deepEqual(prepare({ patch: "patch text" }), { text: "patch text" });
	assert.deepEqual(prepare({ input: "input text" }), { text: "input text" });
	assert.deepEqual(prepare({ content: "content text" }), { text: "content text" });
});

test("row scripts apply replacements to multiple files", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "one\ntwo\n", "utf-8");
		await writeFile(path.join(dir, "b.txt"), "red\nblue\n", "utf-8");
		const edit = createLocalEdit(dir);

		const result = await edit({
			text: [
				"[a.txt]",
				"@REPLACE",
				"-two",
				"+TWO",
				"",
				"[b.txt]",
				"@REPLACE",
				"-red",
				"+RED",
			].join("\n"),
		});

		assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "one\nTWO\n");
		assert.equal(await readFile(path.join(dir, "b.txt"), "utf-8"), "RED\nblue\n");
		assert.match(getText(result), /Applied unified edit to 2 file\(s\)/);
		assert.match(result.details.diff, /^File: a\.txt/m);
		assert.match(result.details.diff, /^File: b\.txt/m);
	});
});

test("row replacement uses unique whole-line fuzzy matching", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "const value = “old”;   \n", "utf-8");
		const edit = createLocalEdit(dir);

		await edit({
			text: "[a.txt]\n@REPLACE\n-const value = \"old\";\n+const value = \"new\";",
		});

		assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "const value = \"new\";\n");
	});
});

test("row replacement rejects duplicate anchors", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "same\nsame\n", "utf-8");
		const edit = createLocalEdit(dir);

		await assert.rejects(
			edit({ text: "[a.txt]\n@REPLACE\n-same\n+changed" }),
			/Found 2 occurrences/,
		);
		assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "same\nsame\n");
	});
});

test("row operations run sequentially", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "one\ntwo\nthree\n", "utf-8");
		const edit = createLocalEdit(dir);

		await edit({
			text: [
				"[a.txt]",
				"@INS.PRE 1",
				"+zero",
				"@INS.POST 2",
				"+one-and-a-half",
				"@INS.BEFORE",
				"-three",
				"+before-three",
				"@INS.AFTER",
				"-three",
				"+after-three",
				"@DEL 4",
				"@APPEND",
				"+last",
			].join("\n"),
		});

		assert.equal(
			await readFile(path.join(dir, "a.txt"), "utf-8"),
			"zero\none\none-and-a-half\nbefore-three\nthree\nafter-three\nlast\n",
		);
	});
});

test("context rows and hunk separators support several replacements", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "start\none\nmiddle\ntwo\nend\n", "utf-8");
		const edit = createLocalEdit(dir);

		await edit({
			text: [
				"[a.txt]",
				"@REPLACE",
				" start",
				"-one",
				"+ONE",
				"@@",
				" middle",
				"-two",
				"+TWO",
			].join("\n"),
		});

		assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "start\nONE\nmiddle\nTWO\nend\n");
	});
});

test("patch payloads add, update, and delete files", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "one\ntwo\n", "utf-8");
		await writeFile(path.join(dir, "gone.txt"), "gone\n", "utf-8");
		const edit = createLocalEdit(dir);

		const result = await edit({
			text: [
				"*** Begin Patch",
				"*** Update File: a.txt",
				"@@",
				" one",
				"-two",
				"+TWO",
				"*** Add File: nested/new.txt",
				"+new",
				"*** Delete File: gone.txt",
				"*** End Patch",
			].join("\n"),
		});

		assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "one\nTWO\n");
		assert.equal(await readFile(path.join(dir, "nested/new.txt"), "utf-8"), "new\n");
		assert.equal(await exists(path.join(dir, "gone.txt")), false);
		assert.equal(result.details.files.length, 3);
	});
});

test("planning failure leaves every target unchanged", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "one\n", "utf-8");
		const edit = createLocalEdit(dir);

		await assert.rejects(
			edit({
				text: "[a.txt]\n@REPLACE\n-one\n+ONE\n[missing.txt]\n@APPEND\n+x",
			}),
			/Could not read missing\.txt/,
		);
		assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "one\n");
	});
});

test("row updates preserve a BOM and CRLF line endings", async () => {
	await withTempDir(async (dir) => {
		await writeFile(path.join(dir, "a.txt"), "\uFEFFone\r\ntwo\r\n", "utf-8");
		const edit = createLocalEdit(dir);

		await edit({ text: "[a.txt]\n@REPLACE\n-two\n+TWO" });

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
	const sandbox = createSandbox(ops, (value) => value.replace("/host/project", "/guest/project"));
	const edit = createEditOverride(sandbox);

	await edit.execute(
		"test",
		{ text: "[a.txt]\n@REPLACE\n-one\n+ONE" },
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
		const edit = createEditOverride(createSandbox());
		const state: Record<string, unknown> = {};
		let invalidations = 0;
		const args = { text: "[a.txt]\n@REPLACE\n-old\n+new" };
		const theme = {
			fg: (_color: string, text: string) => text,
			bold: (text: string) => text,
			bg: (_color: string, text: string) => text,
		};
		const context = (argsComplete: boolean) => ({
			state,
			cwd: dir,
			invalidate: () => invalidations++,
			argsComplete,
			isError: false,
			args,
		});

		try {
			setToolViewMode("minimal");
			const call = edit.renderCall(args, theme, context(true));
			await new Promise((resolve) => setImmediate(resolve));
			assert.equal(invalidations, 0);

			edit.renderResult(
				{
					content: [{ type: "text", text: "Edited a.txt." }],
					details: {
						diff: "-1 old\n+1 new",
						patch: "",
						files: [
							{
								path: "a.txt",
								kind: "update",
								details: { diff: "-1 old\n+1 new", patch: "" },
							},
						],
					},
				},
				{},
				theme,
				context(true),
			);
			assert.doesNotMatch(call.render(120).join("\n"), /[-+]1 (?:old|new)/);

			setToolViewMode("condensed");
			invalidations = 0;
			const streamedEdit = createEditOverride(createSandbox());
			streamedEdit.renderCall(args, theme, {
				...context(false),
				state: {},
			});
			await new Promise((resolve) => setImmediate(resolve));
			assert.equal(invalidations, 0);
		} finally {
			setToolViewMode("minimal");
		}
	});
});
