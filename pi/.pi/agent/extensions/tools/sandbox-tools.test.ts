import assert from "node:assert/strict";
import test from "node:test";
import {
    buildFdFindArgs,
    createSandboxedFindExecute,
    sandboxedFdGlob,
} from "./sandbox-tools.ts";

function getText(result: { content: Array<{ type: string; text?: string }> }): string {
    const entry = result.content[0];
    assert.equal(entry?.type, "text");
    const text = entry?.text;
    if (typeof text !== "string") {
        throw new Error("expected text content");
    }
    return text;
}

test("buildFdFindArgs keeps basename-only glob in basename mode", () => {
    const args = buildFdFindArgs({
        pattern: "*.spec.ts",
        cwd: "/workspace",
        limit: 100,
    });

    assert.deepEqual(args, [
        "--glob",
        "--color=never",
        "--hidden",
        "--no-require-git",
        "--max-results",
        "100",
        "*.spec.ts",
        "/workspace",
    ]);
    assert.ok(!args.includes("--full-path"));
    assert.ok(!args.includes("--ignore-file"));
});

test("buildFdFindArgs enables full-path mode and prefixes path globs", () => {
    const args = buildFdFindArgs({
        pattern: "src/**/*.spec.ts",
        cwd: "/workspace",
        limit: 100,
    });

    assert.deepEqual(args, [
        "--glob",
        "--color=never",
        "--hidden",
        "--no-require-git",
        "--max-results",
        "100",
        "--full-path",
        "**/src/**/*.spec.ts",
        "/workspace",
    ]);
});

test("buildFdFindArgs prefixes subtree globs that do not already start with **/", () => {
    const args = buildFdFindArgs({
        pattern: "some/parent/child/**",
        cwd: "/workspace",
        limit: 100,
    });

    assert.deepEqual(args, [
        "--glob",
        "--color=never",
        "--hidden",
        "--no-require-git",
        "--max-results",
        "100",
        "--full-path",
        "**/some/parent/child/**",
        "/workspace",
    ]);
});

test("buildFdFindArgs leaves leading ** path glob unchanged", () => {
    const args = buildFdFindArgs({
        pattern: "**/parent/child/*",
        cwd: "/workspace",
        limit: 100,
    });

    assert.deepEqual(args, [
        "--glob",
        "--color=never",
        "--hidden",
        "--no-require-git",
        "--max-results",
        "100",
        "--full-path",
        "**/parent/child/*",
        "/workspace",
    ]);
});

test("buildFdFindArgs leaves bare ** in basename mode", () => {
    const args = buildFdFindArgs({
        pattern: "**",
        cwd: "/workspace",
        limit: 100,
    });

    assert.deepEqual(args, [
        "--glob",
        "--color=never",
        "--hidden",
        "--no-require-git",
        "--max-results",
        "100",
        "**",
        "/workspace",
    ]);
    assert.ok(!args.includes("--full-path"));
});

test("sandboxedFdGlob executes fd with normalized arguments", async () => {
    let command = "";

    await sandboxedFdGlob({
        pattern: "src/**/*.spec.ts",
        guestCwd: "/guest/workspace",
        searchPath: "/host/workspace",
        limit: 25,
        exec: async (cmd, { onStdout }) => {
            command = cmd;
            onStdout("");
            return { exitCode: 0 };
        },
    });

    assert.equal(
        command,
        "fd '--glob' '--color=never' '--hidden' '--no-require-git' '--max-results' '25' '--full-path' '**/src/**/*.spec.ts' '/guest/workspace'",
    );
});

test("sandboxedFdGlob remaps guest absolute and relative output paths", async () => {
    const results = await sandboxedFdGlob({
        pattern: "*.ts",
        guestCwd: "/guest/workspace",
        searchPath: "/host/workspace",
        limit: 25,
        exec: async (_cmd, { onStdout }) => {
            onStdout(
                "/guest/workspace/src/main.ts\n./src/util.ts\nlib/feature.ts\n",
            );
            return { exitCode: 0 };
        },
    });

    assert.deepEqual(results, [
        "/host/workspace/src/main.ts",
        "/host/workspace/src/util.ts",
        "/host/workspace/lib/feature.ts",
    ]);
});

test("sandboxedFdGlob preserves root-search workaround for searchPath slash", async () => {
    const results = await sandboxedFdGlob({
        pattern: "*.txt",
        guestCwd: "/guest/root",
        searchPath: "/",
        limit: 25,
        exec: async (_cmd, { onStdout }) => {
            onStdout("/guest/root/etc/hosts\n./tmp/file.txt\n");
            return { exitCode: 0 };
        },
    });

    assert.deepEqual(results, ["//etc/hosts", "//tmp/file.txt"]);
});

test("createSandboxedFindExecute returns relative paths rooted at search path", async () => {
    const findExecute = createSandboxedFindExecute({
        resolveSearchPath: (userPath) =>
            userPath === "." ? "/guest/workspace" : userPath,
        exec: async (_cmd, { onStdout, onStderr }) => {
            onStdout(
                "/guest/workspace/src/main.ts\n./src/util.ts\nlib/feature.ts\n",
            );
            onStderr("");
            return { exitCode: 0 };
        },
    })!;

    const result = await findExecute({ pattern: "*.ts", path: ".", limit: 25 });

    assert.equal(getText(result as any), "src/main.ts\nsrc/util.ts\nlib/feature.ts");
    assert.equal(result.details, undefined);
});

test("createSandboxedFindExecute preserves root-search output semantics", async () => {
    const findExecute = createSandboxedFindExecute({
        resolveSearchPath: () => "/",
        exec: async (_cmd, { onStdout, onStderr }) => {
            onStdout("/etc/hosts\n./tmp/file.txt\n");
            onStderr("");
            return { exitCode: 0 };
        },
    })!;

    const result = await findExecute({ pattern: "*.txt", path: "/", limit: 25 });

    assert.equal(getText(result as any), "etc/hosts\ntmp/file.txt");
    assert.equal(result.details, undefined);
});

test("createSandboxedFindExecute surfaces fd glob parse errors", async () => {
    const findExecute = createSandboxedFindExecute({
        resolveSearchPath: () => "/guest/workspace",
        exec: async (_cmd, { onStdout, onStderr }) => {
            onStdout("");
            onStderr("error parsing glob: unclosed character class");
            return { exitCode: 1 };
        },
    })!;

    await assert.rejects(
        findExecute({ pattern: "[", path: ".", limit: 25 }),
        /error parsing glob/i,
    );
});

test("createSandboxedFindExecute rejects with Operation aborted and forwards signal", async () => {
    let receivedSignal: AbortSignal | undefined;
    const findExecute = createSandboxedFindExecute({
        resolveSearchPath: () => "/guest/workspace",
        exec: async (_cmd, { signal, onStdout, onStderr }) => {
            receivedSignal = signal;
            onStdout("");
            onStderr("");
            return await new Promise<{ exitCode: number }>((_resolve, reject) => {
                signal?.addEventListener(
                    "abort",
                    () => reject(new Error("aborted")),
                    { once: true },
                );
            });
        },
    })!;

    const controller = new AbortController();
    const pending = findExecute(
        { pattern: "*.ts", path: ".", limit: 25 },
        controller.signal,
    );
    controller.abort();

    await assert.rejects(pending, /Operation aborted/);
    assert.equal(receivedSignal?.aborted, true);
});

test("createSandboxedFindExecute includes result limit notice and details", async () => {
    const findExecute = createSandboxedFindExecute({
        resolveSearchPath: () => "/guest/workspace",
        exec: async (_cmd, { onStdout, onStderr }) => {
            onStdout(
                "/guest/workspace/src/main.ts\n/guest/workspace/src/util.ts\n",
            );
            onStderr("");
            return { exitCode: 0 };
        },
    })!;

    const result = await findExecute({ pattern: "*.ts", path: ".", limit: 2 });

    assert.match(getText(result as any), /2 results limit reached/);
    assert.deepEqual(result.details, { resultLimitReached: 2 });
});

test("createSandboxedFindExecute truncates oversized output and reports details", async () => {
    const longPaths = Array.from({ length: 2500 }, (_, i) => {
        const suffix = String(i).padStart(4, "0");
        return `/guest/workspace/${"deep/".repeat(16)}file-${suffix}.ts`;
    }).join("\n");

    const findExecute = createSandboxedFindExecute({
        resolveSearchPath: () => "/guest/workspace",
        exec: async (_cmd, { onStdout, onStderr }) => {
            onStdout(`${longPaths}\n`);
            onStderr("");
            return { exitCode: 0 };
        },
    })!;

    const result = await findExecute({ pattern: "*.ts", path: ".", limit: 5000 });
    const text = getText(result as any);
    const truncation = result.details?.truncation as
        | { truncated?: boolean; totalBytes?: number }
        | undefined;

    assert.match(text, /50\.0KB limit reached/);
    assert.equal(truncation?.truncated, true);
    assert.ok((truncation?.totalBytes ?? 0) > 50 * 1024);
});
