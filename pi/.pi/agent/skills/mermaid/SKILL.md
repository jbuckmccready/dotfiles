---
name: mermaid
description: "Use this skill when creating or editing mermaid diagrams"
---

# Mermaid Skill

Use this skill to validate Mermaid syntax, print terminal ASCII diagrams, and render SVG output.

## Tool

- `scripts/render-mermaid.ts`

## Usage

From the skill directory (the folder containing this `SKILL.md`):

```bash
# ASCII mode: validate + ASCII only (no SVG file written)
./scripts/render-mermaid.ts --ascii path/to/diagram.mmd

# Validate mode: syntax check only
./scripts/render-mermaid.ts --validate path/to/diagram.mmd

# SVG mode (default): validate + ASCII preview + write SVG
./scripts/render-mermaid.ts path/to/diagram.mmd [path/to/output.svg]
```

## Behavior

- **SVG mode (default)**: validates Mermaid, writes SVG, then prints ASCII preview.
- **`--ascii`**: validates Mermaid, prints ASCII only.
- **`--validate`**: validates syntax only.
- Optional `output.svg` is only supported in default SVG mode.
- If no `output.svg` is given in default mode, output is derived from input:
  - `diagram.mmd` → `diagram.svg`
  - `diagram` → `diagram.svg`
  - `.hidden-noext` → `.hidden-noext.svg`

## Exit codes

- `0`: success
- `1`: argument/file/validation error
- `2`: ASCII rendering failed after successful validation

## Notes

- Requires Bun (`#!/usr/bin/env bun`).
- Uses `beautiful-mermaid` via Bun's npm import (`npm:beautiful-mermaid`).
- ASCII output mode is the fastest way to verify both syntax and terminal rendering.
