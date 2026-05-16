import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createEditOverride } from "./override-edit.ts";
import type { SandboxAPI } from "./sandbox-shared.ts";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(tmpdir(), "pi-edit-test-"));
    try {
        return await fn(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

function getText(result: Awaited<ReturnType<ReturnType<typeof createLocalEdit>>>): string {
    const entry = result.content[0];
    assert.equal(entry.type, "text");
    if (entry.type !== "text") throw new Error("Expected text content");
    return entry.text;
}

function createLocalEdit(cwd: string) {
    const sandbox: SandboxAPI = {
        isActive: () => false,
        getOps: () => ({}),
        translatePath: (hostPath) => hostPath,
    };
    const edit = createEditOverride(sandbox);
    const ctx = { cwd } as ExtensionContext;
    return (params: Parameters<typeof edit.execute>[1]) =>
        edit.execute("test", params, undefined, undefined, ctx);
}

function renderCallText(args: Parameters<ReturnType<typeof createEditOverride>["renderCall"]>[0]): string {
    const sandbox: SandboxAPI = {
        isActive: () => false,
        getOps: () => ({}),
        translatePath: (hostPath) => hostPath,
    };
    const edit = createEditOverride(sandbox);
    const theme = {
        fg: (_color: string, text: string) => text,
        bold: (text: string) => text,
    } as any;
    return edit.renderCall(args, theme, { state: {}, isPartial: false }).render(200).join("\n");
}

async function exists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

test("edit accepts top-level oldText and newText schema", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "alpha beta\n", "utf-8");
        const edit = createLocalEdit(dir);

        await edit({ path: "a.txt", oldText: "beta", newText: "BETA" });

        assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "alpha BETA\n");
    });
});

test("edit rejects empty oldText in classic mode", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "alpha\n", "utf-8");
        const edit = createLocalEdit(dir);

        await assert.rejects(
            edit({ path: "a.txt", oldText: "", newText: "prefix" }),
            /oldText must not be empty/,
        );

        assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "alpha\n");
    });
});

test("edit applies multi-file classic edits", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "a1\n", "utf-8");
        await writeFile(path.join(dir, "b.txt"), "b1\n", "utf-8");
        const edit = createLocalEdit(dir);

        await edit({
            multi: [
                { path: "a.txt", oldText: "a1", newText: "a2" },
                { path: "b.txt", oldText: "b1", newText: "b2" },
            ],
        });

        assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "a2\n");
        assert.equal(await readFile(path.join(dir, "b.txt"), "utf-8"), "b2\n");
    });
});

test("edit supports repeated same-file replacements and redundant duplicate skips", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "x\nx\n", "utf-8");
        const edit = createLocalEdit(dir);

        const result = await edit({
            path: "a.txt",
            multi: [
                { oldText: "x", newText: "y" },
                { oldText: "x", newText: "y" },
                { oldText: "x", newText: "y" },
            ],
        });

        assert.match(getText(result), /Skipped redundant edit/);
        assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "y\ny\n");
    });
});

test("single-file multi edits do not prefix the diff with a redundant file header", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "one\ntwo\nthree\n", "utf-8");
        const edit = createLocalEdit(dir);

        const result = await edit({
            path: "a.txt",
            multi: [
                { oldText: "one", newText: "ONE" },
                { oldText: "three", newText: "THREE" },
            ],
        });

        assert.equal(result.details?.diff?.startsWith("File: a.txt\n"), false);
        assert.match(result.details?.diff ?? "", /^-1 one\n\+1 ONE/m);
    });
});

test("single-file classic calls render the file path in the header", () => {
    const text = renderCallText({
        path: "a.txt",
        multi: [
            { oldText: "one", newText: "ONE" },
            { oldText: "two", newText: "TWO" },
        ],
    });

    assert.match(text, /^edit a\.txt \+2 -2$/);
});

test("multi-file classic calls render a summary header and label each file in the diff body", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "one\n", "utf-8");
        await writeFile(path.join(dir, "b.txt"), "two\n", "utf-8");
        const edit = createLocalEdit(dir);

        const callText = renderCallText({
            multi: [
                { path: "a.txt", oldText: "one", newText: "ONE" },
                { path: "b.txt", oldText: "two", newText: "TWO" },
            ],
        });
        const result = await edit({
            multi: [
                { path: "a.txt", oldText: "one", newText: "ONE" },
                { path: "b.txt", oldText: "two", newText: "TWO" },
            ],
        });

        assert.match(callText, /^edit 2 files, 2 edits \+2 -2$/);
        assert.match(
            result.details?.diff ?? "",
            /^File: a\.txt\n-1 one\n\+1 ONE\n\nFile: b\.txt\n-1 two\n\+1 TWO$/m,
        );
    });
});

test("classic preflight failure leaves all target files unchanged", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "ok\n", "utf-8");
        await writeFile(path.join(dir, "b.txt"), "keep\n", "utf-8");
        const edit = createLocalEdit(dir);

        await assert.rejects(
            edit({
                multi: [
                    { path: "a.txt", oldText: "ok", newText: "changed" },
                    { path: "b.txt", oldText: "missing", newText: "changed" },
                ],
            }),
            /Preflight failed before mutating files/,
        );

        assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "ok\n");
        assert.equal(await readFile(path.join(dir, "b.txt"), "utf-8"), "keep\n");
    });
});

test("patch add creates parent directories", async () => {
    await withTempDir(async (dir) => {
        const edit = createLocalEdit(dir);

        await edit({
            patch: "*** Begin Patch\n*** Add File: nested/new.txt\n+hello\n*** End Patch",
        });

        assert.equal(await readFile(path.join(dir, "nested/new.txt"), "utf-8"), "hello\n");
    });
});

test("patch update applies hunks", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "one\ntwo\nthree\n", "utf-8");
        const edit = createLocalEdit(dir);

        await edit({
            patch: "*** Begin Patch\n*** Update File: a.txt\n@@\n one\n-two\n+TWO\n three\n*** End Patch",
        });

        assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "one\nTWO\nthree\n");
    });
});

test("patch delete removes files", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "gone.txt"), "bye\n", "utf-8");
        const edit = createLocalEdit(dir);

        await edit({
            patch: "*** Begin Patch\n*** Delete File: gone.txt\n*** End Patch",
        });

        assert.equal(await exists(path.join(dir, "gone.txt")), false);
    });
});

test("single-file patch results do not prefix the diff with a redundant file header", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "one\ntwo\n", "utf-8");
        const edit = createLocalEdit(dir);

        const result = await edit({
            patch: "*** Begin Patch\n*** Update File: a.txt\n@@\n one\n-two\n+TWO\n*** End Patch",
        });

        assert.equal(result.details?.diff?.startsWith("File: a.txt\n"), false);
        assert.match(result.details?.diff ?? "", /^ 1 one\n-2 two\n\+2 TWO/m);
    });
});

test("single-file patch calls render the file path in the header", () => {
    const text = renderCallText({
        patch: "*** Begin Patch\n*** Update File: a.txt\n@@\n-one\n+ONE\n*** End Patch",
    });

    assert.match(text, /^edit a\.txt 1 update$/);
});

test("multi-file patch calls render a summary header and label each file in the diff body", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "one\n", "utf-8");
        await writeFile(path.join(dir, "b.txt"), "two\n", "utf-8");
        const edit = createLocalEdit(dir);

        const patch = [
            "*** Begin Patch",
            "*** Update File: a.txt",
            "@@",
            "-one",
            "+ONE",
            "*** Update File: b.txt",
            "@@",
            "-two",
            "+TWO",
            "*** End Patch",
        ].join("\n");

        const callText = renderCallText({ patch });
        const result = await edit({ patch });

        assert.match(callText, /^edit 2 files 2 update$/);
        assert.match(
            result.details?.diff ?? "",
            /^File: a\.txt\n-1 one\n\+1 ONE\n\nFile: b\.txt\n-1 two\n\+1 TWO$/m,
        );
    });
});

test("patch preflight failure leaves files unchanged", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "one\n", "utf-8");
        const edit = createLocalEdit(dir);

        await assert.rejects(
            edit({
                patch: "*** Begin Patch\n*** Update File: a.txt\n@@\n-missing\n+changed\n*** Add File: added.txt\n+new\n*** End Patch",
            }),
            /Preflight failed before mutating files/,
        );

        assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "one\n");
        assert.equal(await exists(path.join(dir, "added.txt")), false);
    });
});

test("concurrent same-file edits serialize through the mutation queue", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "a\nb\n", "utf-8");
        const edit = createLocalEdit(dir);

        await Promise.all([
            edit({ path: "a.txt", oldText: "a", newText: "A" }),
            edit({ path: "a.txt", oldText: "b", newText: "B" }),
        ]);

        assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "A\nB\n");
    });
});

test("multi-file edits touching the same paths in different orders do not deadlock", async () => {
    await withTempDir(async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "a1\na2\n", "utf-8");
        await writeFile(path.join(dir, "b.txt"), "b1\nb2\n", "utf-8");
        const edit = createLocalEdit(dir);

        await Promise.race([
            Promise.all([
                edit({
                    multi: [
                        { path: "a.txt", oldText: "a1", newText: "A1" },
                        { path: "b.txt", oldText: "b1", newText: "B1" },
                    ],
                }),
                edit({
                    multi: [
                        { path: "b.txt", oldText: "b2", newText: "B2" },
                        { path: "a.txt", oldText: "a2", newText: "A2" },
                    ],
                }),
            ]),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("deadlock timeout")), 2000),
            ),
        ]);

        assert.equal(await readFile(path.join(dir, "a.txt"), "utf-8"), "A1\nA2\n");
        assert.equal(await readFile(path.join(dir, "b.txt"), "utf-8"), "B1\nB2\n");
    });
});
