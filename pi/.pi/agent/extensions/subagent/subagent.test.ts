import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import subagentExtension from "./index.ts";
import { renderResult, setViewMode } from "./render.ts";
import { buildPiArgs, mapConcurrent } from "./runner.ts";
import {
  type SingleResult,
  type SubagentDetails,
  aggregateUsage,
  emptyUsage,
  getFinalOutput,
  sumUsage,
} from "./types.ts";

function makeResult(overrides: Partial<SingleResult> = {}): SingleResult {
  return {
    task: "Review the change",
    exitCode: 0,
    messages: [],
    stderr: "",
    usage: emptyUsage(),
    ...overrides,
  };
}

describe("subagent child arguments", () => {
  it("passes the inherited active tools as a strict allowlist", () => {
    const args = buildPiArgs(
      "openai",
      "gpt-5.4",
      "high",
      ["read", "grep", "find", "ls"],
      "Task: Review the change",
      { kind: "sessionDir", path: "/tmp/session", continueSession: false },
    );

    const toolsIndex = args.indexOf("--tools");
    assert.notEqual(toolsIndex, -1);
    assert.equal(args[toolsIndex + 1], "read,grep,find,ls");
    assert.equal(args.includes("bash"), false);
    assert.equal(args.includes("edit"), false);
    assert.equal(args.includes("write"), false);
  });

  it("passes an empty allowlist instead of enabling child defaults", () => {
    const args = buildPiArgs(
      undefined,
      undefined,
      undefined,
      [],
      "Task: Report status",
      { kind: "sessionDir", path: "/tmp/session", continueSession: false },
    );

    const toolsIndex = args.indexOf("--tools");
    assert.notEqual(toolsIndex, -1);
    assert.equal(args[toolsIndex + 1], "");
  });
});

describe("subagent retry usage", () => {
  it("sums additive fields and keeps the latest context snapshot", () => {
    const first = makeResult({
      usage: {
        input: 10,
        output: 2,
        cacheRead: 3,
        cacheWrite: 4,
        cost: 0.1,
        contextTokens: 100,
        turns: 1,
        toolCalls: 2,
      },
    });
    const retry = makeResult({
      usage: {
        input: 20,
        output: 5,
        cacheRead: 6,
        cacheWrite: 7,
        cost: 0.2,
        contextTokens: 80,
        turns: 2,
        toolCalls: 1,
      },
    });

    assert.deepEqual(aggregateUsage([first, retry]), {
      input: 30,
      output: 7,
      cacheRead: 9,
      cacheWrite: 11,
      cost: 0.30000000000000004,
      contextTokens: 80,
      turns: 3,
      toolCalls: 3,
    });
  });

  it("sums context snapshots across independent parallel runs", () => {
    const first = makeResult({
      usage: { ...emptyUsage(), input: 10, contextTokens: 100 },
    });
    const second = makeResult({
      usage: { ...emptyUsage(), input: 20, contextTokens: 80 },
    });

    assert.deepEqual(sumUsage([first, second]), {
      ...emptyUsage(),
      input: 30,
      contextTokens: 180,
    });
  });
});

describe("subagent partial rendering", () => {
  const theme = {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
    getFgAnsi: () => "",
  };

  for (const mode of ["condensed", "expanded"] as const) {
    it(`shows a running placeholder in ${mode} mode`, () => {
      setViewMode(mode);
      const result = makeResult({ exitCode: -1 });
      const component = renderResult(
        {
          content: [],
          details: {
            mode: "single",
            delegationMode: "spawn",
            results: [result],
          },
        },
        { expanded: mode === "expanded", isPartial: true },
        theme,
        { state: {} },
      );

      const output = component.render(80).join("\n");
      assert.match(output, /\(running\.\.\.\)/);
      assert.doesNotMatch(output, /\(no output\)/);
    });
  }

  it("reserves the no-output placeholder for completed results", () => {
    setViewMode("expanded");
    const result = makeResult();
    const component = renderResult(
      {
        content: [],
        details: {
          mode: "single",
          delegationMode: "spawn",
          results: [result],
        },
      },
      { expanded: true, isPartial: false },
      theme,
      { state: {} },
    );

    const output = component.render(80).join("\n");
    assert.match(output, /\(no output\)/);
    assert.doesNotMatch(output, /\(running\.\.\.\)/);
  });
});

describe("subagent parallel execution", () => {
  it("preserves result order while bounding concurrency", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapConcurrent([1, 2, 3, 4, 5], 2, async (value) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return value * 2;
    });

    assert.deepEqual(results, [2, 4, 6, 8, 10]);
    assert.equal(peak, 2);
  });

  it("runs all tasks with the inherited model and tool allowlist", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-subagent-test-"));
    const fakePiPath = path.join(tempDir, "pi");
    const argsLogPath = path.join(tempDir, "args.jsonl");
    const originalPath = process.env.PATH;
    const originalLog = process.env.FAKE_PI_ARGS_LOG;

    await writeFile(
      fakePiPath,
      `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(process.env.FAKE_PI_ARGS_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
const prompt = process.argv.at(-1);
console.log(JSON.stringify({
  type: "message_end",
  message: {
    role: "assistant",
    content: [{ type: "text", text: prompt }],
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { total: 0 }
    },
    model: "test-model",
    stopReason: "stop"
  }
}));
`,
      "utf8",
    );
    await chmod(fakePiPath, 0o755);

    type ToolResult = {
      content: Array<{ type: string; text?: string }>;
      details: SubagentDetails;
      isError?: boolean;
    };
    type RegisteredTool = {
      execute: (
        toolCallId: string,
        params: {
          task?: string;
          tasks?: Array<{ task: string }>;
          mode?: string;
        },
        signal: AbortSignal | undefined,
        onUpdate:
          | ((result: {
              content: Array<{ type: "text"; text: string }>;
              details: SubagentDetails;
            }) => void)
          | undefined,
        context: {
          cwd: string;
          model: { provider: string; id: string };
          thinkingLevel: string;
          sessionManager: {
            getHeader: () => unknown;
            getBranch: () => unknown[];
          };
        },
      ) => Promise<ToolResult>;
    };

    let registeredTool: RegisteredTool | undefined;
    const pi = {
      events: { on: () => {} },
      registerFlag: () => {},
      getFlag: () => undefined,
      getActiveTools: () => ["read", "subagent"],
      registerTool: (tool: unknown) => {
        registeredTool = tool as RegisteredTool;
      },
    };
    subagentExtension(pi as never);
    if (!registeredTool) throw new Error("Subagent tool was not registered");

    process.env.PATH = `${tempDir}${path.delimiter}${originalPath ?? ""}`;
    process.env.FAKE_PI_ARGS_LOG = argsLogPath;

    try {
      const updates: SubagentDetails[] = [];
      const result = await registeredTool.execute(
        "parallel-test",
        {
          tasks: [{ task: "first" }, { task: "second" }],
          mode: "spawn",
        },
        undefined,
        (update) => updates.push(update.details),
        {
          cwd: tempDir,
          model: { provider: "test-provider", id: "test-model" },
          thinkingLevel: "high",
          sessionManager: {
            getHeader: () => ({}),
            getBranch: () => [],
          },
        },
      );

      assert.equal(result.isError, undefined);
      assert.equal(result.details.mode, "parallel");
      assert.deepEqual(
        result.details.results.map((item) => getFinalOutput(item.messages)),
        ["Task: first", "Task: second"],
      );
      assert.match(result.content[0]?.text ?? "", /Parallel: 2\/2 succeeded/);
      assert.ok(updates.some((details) => details.results.length === 2));

      const childArgs = (await readFile(argsLogPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as string[]);
      assert.equal(childArgs.length, 2);
      for (const args of childArgs) {
        assert.equal(args[args.indexOf("--provider") + 1], "test-provider");
        assert.equal(args[args.indexOf("--model") + 1], "test-model");
        assert.equal(args[args.indexOf("--thinking") + 1], "high");
        assert.equal(args[args.indexOf("--tools") + 1], "read,subagent");
      }
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      if (originalLog === undefined) delete process.env.FAKE_PI_ARGS_LOG;
      else process.env.FAKE_PI_ARGS_LOG = originalLog;
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
