---
description: Initialize a new spec from a human description. Creates spec directory with spec.md and resources folder.
disable-model-invocation: true
---

# initialize_spec

Use the spec-flow-instructions skill if spec flow instructions is not in context before doing anything.

## Purpose

Start a new spec from a human description. Creates `specs/<slug>/spec.md` with standard structure.

## Input

$ARGUMENTS

Expects: `<DESCRIPTION> <INSTRUCTIONS>`

- **DESCRIPTION**: human description of the spec to initialize
- **INSTRUCTIONS**: specific considerations for spec initialization (optional)

## Output

- `specs/<slug>/spec.md` with all required sections
- `specs/<slug>/resources/` directory (empty)

## Rules

- **Title**: Derive Title Case from description
- **Slug**: Generate kebab-case from title
- **Requirements**: Phrase as observable outcomes (WHAT), not implementation (no tech names, data structures, or function signatures)
- **Resource parsing**: Extract only URIs/paths explicitly mentioned. Never invent additional resources.
- **Resource initialization**: Add placeholder entries with "TBD" analysis only. Do not fetch or analyze.
- **Task initialization**: Leave tasks section with TODO placeholder

## spec.md Template

Use template at `templates/spec.md` from the spec-flow-instructions skill.
