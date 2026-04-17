import assert from "node:assert/strict";
import test from "node:test";
import { createFindOverride } from "./override-find.ts";

function getText(result: { content: Array<{ type: string; text?: string }> }): string {
    const entry = result.content[0];
    assert.equal(entry?.type, "text");
    const text = entry?.text;
    if (typeof text !== "string") {
        throw new Error("expected text content");
    }
    return text;
}

test("createFindOverride prefers sandbox findExecute when available", async () => {
    let fallbackCalled = false;
    const override = createFindOverride({
        isActive: () => true,
        translatePath: (hostPath) => `/guest${hostPath}`,
        getOps: () => ({
            findExecute: async (params) => ({
                content: [
                    {
                        type: "text",
                        text: `findExecute:${params.pattern}`,
                    },
                ],
                details: undefined,
            }),
            find: {
                exists: async () => true,
                glob: async () => {
                    fallbackCalled = true;
                    return [];
                },
            },
        }),
    });

    const result = await override.execute(
        "test-call-find-1",
        { pattern: "*.ts" },
        undefined,
        undefined,
        { cwd: "/workspace" } as any,
    );

    assert.equal(getText(result as any), "findExecute:*.ts");
    assert.equal(fallbackCalled, false);
});

test("createFindOverride falls back to built-in find tool operations", async () => {
    let translatedCwd = "";
    const override = createFindOverride({
        isActive: () => true,
        translatePath: (hostPath) => {
            translatedCwd = `/guest${hostPath}`;
            return translatedCwd;
        },
        getOps: () => ({
            find: {
                exists: async () => true,
                glob: async (_pattern, cwd, _options) => [
                    `${cwd}/src/main.ts`,
                    `${cwd}/src/util.ts`,
                ],
            },
        }),
    });

    const result = await override.execute(
        "test-call-find-2",
        { pattern: "*.ts", path: ".", limit: 10 },
        undefined,
        undefined,
        { cwd: "/workspace" } as any,
    );

    assert.equal(translatedCwd, "/guest/workspace");
    assert.equal(getText(result as any), "src/main.ts\nsrc/util.ts");
    assert.equal(result.details, undefined);
});
