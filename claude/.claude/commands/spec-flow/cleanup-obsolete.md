---
description: Remove obsolete requirements and renumber all IDs to eliminate gaps. Updates spec.md and all resource references.
disable-model-invocation: true
---

# cleanup_obsolete

Use the spec-flow-instructions skill if it is not active before doing anything.

## Purpose

Remove all requirements marked as `[obsolete]` and renumber remaining requirements to eliminate ID gaps. Updates all references in the spec and resource files.

## Input

$ARGUMENTS

Expects: `<SPEC_SLUG>`

- **SPEC_SLUG**: kebab-case spec identifier

## Output

- Updated `specs/<SPEC_SLUG>/spec.md`:
  - Obsolete requirements removed
  - Remaining requirements renumbered (R-001, R-002, R-003...)
  - Task references updated to new IDs
- Updated `specs/<SPEC_SLUG>/resources/*.md`:
  - `supports_requirements` frontmatter updated with new IDs
  - Spec Alignment section references updated

## Process

### 1. Read Context

- `specs/<SPEC_SLUG>/spec.md` — identify obsolete and active requirements
- All files under `specs/<SPEC_SLUG>/resources/*.md` — identify requirement references

### 2. Build Renumbering Map

- List all active (non-obsolete) requirements in order
- Create mapping: old ID → new ID (e.g., R-003 → R-001, R-005 → R-002)

### 3. Update Spec File

- Remove all requirements marked `[obsolete]`
- Update remaining requirement IDs per mapping (contiguous numbering)
- Update all R-XXX references in Tasks section

### 4. Update Resource Files

For each resource file:

- Update `supports_requirements` array in YAML frontmatter
- Update R-XXX references in Spec Alignment section
- Remove references to deleted requirements

## Rules

- **Preserve order**: Maintain relative ordering of active requirements
- **Complete update**: All R-XXX references must be updated consistently
- **No orphans**: If a resource only supported obsolete requirements, warn user
