import assert from "node:assert/strict";
import test from "node:test";
import { findMatchingSentinel } from "./docker-sandbox.ts";

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
