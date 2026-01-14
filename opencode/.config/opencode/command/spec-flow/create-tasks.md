---
description: Generate concrete implementation tasks from the refined spec. Focus on code changes and specific actions required.
disable-model-invocation: true
---

# create_tasks

Use the spec-flow-instructions skill if spec flow instructions is not in context before doing anything.

## Purpose

Generate concrete implementation tasks that satisfy all requirements. Each task describes specific code changes or actions needed. Tasks must be actionable, traceable, and scoped for coding agents.

## Input

$ARGUMENTS

Expects: `<SPEC_SLUG> <INSTRUCTIONS>`

- **SPEC_SLUG**: kebab-case spec identifier
- **INSTRUCTIONS**: specific considerations for task generation (optional)

## Output

- Updated `specs/<SPEC_SLUG>/spec.md`:
  - Populated Tasks section

## Process

### 1. Read Context

- Instructions provided in the input
- `specs/<SPEC_SLUG>/spec.md` — refined requirements
- All files under `specs/<SPEC_SLUG>/resources/*.md` — implementation guidance
- **Inspect the codebase** — current structure, patterns, file locations, component names

### 2. Generate Tasks

For each requirement, determine what implementation work is needed:

- **Code changes**: Files to create/modify, functions to add/change
- **Tool calls**: CLI commands, build steps, migrations
- **Configuration**: Environment variables, config files, feature flags
- **Testing**: Test files to create, manual verification steps

### 3. Write Tasks

- **Requirement coverage**: Every active R-XXX must map to at least one task
- **Task specificity**: Include specific file paths, component names, function signatures
- **Task independence**: Keep independent when possible; mark dependencies explicitly
- **Section scope**: Only modify Tasks section within the spec file

## Rules

- **Codebase inspection required**: Tasks must reference actual files, components, patterns
- **No vague tasks**: "Update the component" is not acceptable; "Update `src/components/Button.tsx` to add onClick handler matching the pattern in `Card.tsx`" is
- **Reference requirements**: Each task overview must cite which R-XXX it addresses
- **Implementation focus**: Tasks describe HOW to implement, not WHAT to achieve

## Task Template

```markdown
### <Task Title> (T-XXX) [pending]

#### Overview

Addresses R-XXX by... [explanation and approach]

#### Acceptance Criteria

- [verifiable outcome]
- [demo-able result]

#### Implementation Details

- **Files to modify**: `path/to/file.ts`
- **Functions to change**: `functionName()`
- **Patterns to follow**: Similar to existing implementation in `OtherFile.ts`
- **Integration**: Use specific hooks, context, APIs
- **Testing**: How to verify the change works
```
