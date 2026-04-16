import assert from "node:assert/strict";
import test from "node:test";
import { buildFdFindArgs, sandboxedFdGlob } from "./sandbox-tools.ts";

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
