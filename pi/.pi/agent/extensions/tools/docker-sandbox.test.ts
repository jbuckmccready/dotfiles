import assert from "node:assert/strict";
import test from "node:test";
import {
    findMatchingSentinel,
    inspectStreamingControlBuffer,
} from "./docker-sandbox.ts";

function sentinel(exitCode: number, uuid: string): string {
    return `\0\0PIEOF:${exitCode}:${uuid}\0\0\n`;
}

test("findMatchingSentinel returns null when there is no sentinel", () => {
    const result = findMatchingSentinel(Buffer.from("plain output\n"), "u1");
    assert.equal(result, null);
});

test("findMatchingSentinel returns null for incomplete sentinel line", () => {
    const buf = Buffer.from("prefix\0\0PIEOF:0:u1\0\0");
    const result = findMatchingSentinel(buf, "u1");
    assert.equal(result, null);
});

test("findMatchingSentinel returns index + exit code for matching uuid", () => {
    const uuid = "u-match";
    const output = "hello\n";
    const buf = Buffer.from(output + sentinel(23, uuid));

    const result = findMatchingSentinel(buf, uuid);

    assert.deepEqual(result, { idx: Buffer.byteLength(output), exitCode: 23 });
});

test("findMatchingSentinel skips non-matching sentinel-like output", () => {
    const uuid = "u-real";
    const fake = sentinel(0, "u-fake");
    const between = "after fake\n";
    const real = sentinel(7, uuid);
    const buf = Buffer.from(fake + between + real);

    const result = findMatchingSentinel(buf, uuid);

    assert.deepEqual(result, {
        idx: Buffer.byteLength(fake + between),
        exitCode: 7,
    });
});

test("findMatchingSentinel skips malformed sentinel lines and finds valid one", () => {
    const uuid = "u-real";
    const malformed = "\0\0PIEOF:not-a-code:u-real\0\0\n";
    const real = sentinel(3, uuid);
    const buf = Buffer.from(malformed + real);

    const result = findMatchingSentinel(buf, uuid);

    assert.deepEqual(result, {
        idx: Buffer.byteLength(malformed),
        exitCode: 3,
    });
});

test("inspectStreamingControlBuffer matches the current command sentinel", () => {
    const uuid = "u-real";
    const result = inspectStreamingControlBuffer(Buffer.from(sentinel(9, uuid)), uuid);

    assert.deepEqual(result, {
        kind: "matched",
        bytes: Buffer.byteLength(sentinel(9, uuid)),
        exitCode: 9,
    });
});

test("inspectStreamingControlBuffer returns pending for an incomplete control sentinel", () => {
    const uuid = "u-real";
    const result = inspectStreamingControlBuffer(
        Buffer.from("\0\0PIEOF:9:u-real\0\0"),
        uuid,
    );

    assert.deepEqual(result, { kind: "pending" });
});

test("inspectStreamingControlBuffer handles a sentinel split across stderr chunks", () => {
    const uuid = "u-real";
    let pending = Buffer.alloc(0);
    const chunks = ["\0\0PI", "EOF:12:", "u-real\0", "\0\n"];

    for (const [index, chunk] of chunks.entries()) {
        pending = Buffer.concat([pending, Buffer.from(chunk)]);
        const result = inspectStreamingControlBuffer(pending, uuid);
        if (index < chunks.length - 1) {
            assert.deepEqual(result, { kind: "pending" });
        } else {
            assert.deepEqual(result, {
                kind: "matched",
                bytes: Buffer.byteLength(sentinel(12, uuid)),
                exitCode: 12,
            });
        }
    }
});

test("inspectStreamingControlBuffer consumes non-matching sentinels while searching", () => {
    const uuid = "u-real";
    const fake = sentinel(0, "u-fake");
    const result = inspectStreamingControlBuffer(Buffer.from(fake), uuid);

    assert.deepEqual(result, {
        kind: "consume",
        bytes: Buffer.byteLength(fake),
    });
});

test("inspectStreamingControlBuffer rejects malformed sentinel-like stderr", () => {
    const uuid = "u-real";
    const result = inspectStreamingControlBuffer(
        Buffer.from("\0\0PIEOF:not-a-code:u-real\0\0\n"),
        uuid,
    );

    assert.equal(result.kind, "error");
    assert.match(result.message, /Malformed docker control sentinel on stderr/);
});

test("inspectStreamingControlBuffer rejects unexpected non-sentinel stderr bytes", () => {
    const uuid = "u-real";
    const result = inspectStreamingControlBuffer(Buffer.from("docker warning\n"), uuid);

    assert.equal(result.kind, "error");
    assert.match(result.message, /Unexpected data on docker control stderr/);
});
