import assert from "node:assert/strict";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDisabledSandbox } from "./disabled-sandbox.ts";
import {
    assertReadSize,
    MAX_READ_BYTES,
} from "./sandbox-shared.ts";

test("assertReadSize allows files at the read limit", () => {
    assert.doesNotThrow(() =>
        assertReadSize("at-limit.bin", MAX_READ_BYTES),
    );
});

test("assertReadSize rejects files over the read limit", () => {
    assert.throws(
        () => assertReadSize("large.bin", MAX_READ_BYTES + 1),
        /File is too large to read.*10\.0 MB, maximum 10\.0 MB.*Use bash/,
    );
});

test("disabled read checks size before loading the file", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-read-size-test-"));
    const filePath = join(root, "large.bin");

    try {
        await writeFile(filePath, "");
        await truncate(filePath, MAX_READ_BYTES + 1);

        const readOps = createDisabledSandbox().getOps().read;
        assert.ok(readOps);
        await assert.rejects(
            readOps.readFile(filePath),
            /File is too large to read.*Use bash/,
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
