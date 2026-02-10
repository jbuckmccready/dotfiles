#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, parse } from "node:path";
import { renderMermaid, renderMermaidAscii } from "beautiful-mermaid";

type Mode = "svg" | "ascii" | "validate";

function usage(scriptName: string): void {
  console.log(`Usage:
  ${scriptName} diagram.mmd [output.svg]
      Validate Mermaid, print ASCII preview, and write SVG output.

  ${scriptName} --ascii diagram.mmd
      Validate Mermaid and print only the ASCII diagram.

  ${scriptName} --validate diagram.mmd
      Validate Mermaid syntax only.
`);
}

function fail(message: string, exitCode = 1): never {
  console.error(message);
  process.exit(exitCode);
}

function defaultOutputPath(inputPath: string): string {
  const parsed = parse(inputPath);
  if (!parsed.ext) return `${inputPath}.svg`;
  return join(parsed.dir, `${parsed.name}.svg`);
}

async function main(): Promise<void> {
  const scriptName = basename(process.argv[1] ?? "render-mermaid.ts");
  const args = process.argv.slice(2);

  let mode: Mode = "svg";

  const first = args[0];
  if (first === "--ascii") {
    mode = "ascii";
    args.shift();
  } else if (first === "--validate") {
    mode = "validate";
    args.shift();
  } else if (first === "-h" || first === "--help") {
    usage(scriptName);
    process.exit(0);
  }

  if ((args[0] ?? "").startsWith("-")) {
    fail(`Error: Unknown option: ${args[0]}\n`);
  }

  if (args.length < 1) {
    usage(scriptName);
    process.exit(1);
  }

  const inputPath = args[0];
  if (!existsSync(inputPath)) {
    fail(`Error: File not found: ${inputPath}`);
  }

  let outputPath = "";
  if (mode === "svg") {
    if (args.length > 2) {
      fail("Error: Too many arguments\n");
    }
    outputPath = args[1] ?? defaultOutputPath(inputPath);
  } else if (args.length > 1) {
    fail("Error: Output path is only supported in default mode\n");
  }

  const mermaidSource = readFileSync(inputPath, "utf8");

  try {
    if (mode === "svg") {
      console.log(`Rendering: ${inputPath}`);
      const svg = await renderMermaid(mermaidSource);
      writeFileSync(outputPath, svg, "utf8");

      console.log("✓ Mermaid OK\n");
      console.log("ASCII preview:");
      try {
        process.stdout.write(renderMermaidAscii(mermaidSource));
        process.stdout.write("\n");
      } catch {
        console.log("Warning: ASCII preview failed (diagram type may be unsupported).\n");
      }

      console.log(`Rendered to: ${outputPath}`);
      return;
    }

    // Validate syntax in non-SVG modes.
    await renderMermaid(mermaidSource);

    if (mode === "validate") {
      console.log(`Validating: ${inputPath}`);
      console.log("✓ Mermaid OK");
      return;
    }

    try {
      process.stdout.write(renderMermaidAscii(mermaidSource));
      process.stdout.write("\n");
    } catch (error) {
      fail(`✗ Mermaid ASCII rendering failed\n${(error as Error).message ?? String(error)}`, 2);
    }
  } catch (error) {
    fail(`✗ Mermaid validation failed\n${(error as Error).message ?? String(error)}`, 1);
  }
}

await main();
