---
description: Step 1 of 5 in the spec workflow. Start a new spec from a human description and optional initial resource sources.
disable-model-invocation: true
---

# initialize_spec

## Purpose

**Step 1 of 5** in the spec workflow. Start a new spec from a human description and optional initial resource sources. The result is a new `spec.md` in `specs/<kebab-case-slug>/` with the standard structure.

**Workflow Order:** **initialize_spec** → create_resource → update_spec → create_tasks → execute_task

---

## Inputs

The following is the natural language description of the intended change. May contain instructions, URIs, or file paths that should be parsed as instructions or resource sources:

$ARGUMENTS

---

## Outputs

- `specs/<kebab-case-slug>/spec.md` with all required sections in place
- `specs/<kebab-case-slug>/resources/` directory created (empty initially)

---

## Rules

- **Title**: Derive a Title Case title from the description
- **Slug**: Generate a kebab-case slug from the title (e.g., "AI Agent Chat" → "ai-agent-chat")
- **Anchors**: Use consistent section anchors for machine edits:
  - `<!-- @section:overview -->` ... `<!-- @end -->`
  - `<!-- @section:requirements -->` ... `<!-- @end -->`
  - `<!-- @section:resources -->` ... `<!-- @end -->`
  - `<!-- @section:tasks -->` ... `<!-- @end -->`
- **IDs**: Use sequential numbering starting from 001:
  - Requirements: `R-001`, `R-002`, `R-003`, ...
  - Resources: `RS-001`, `RS-002`, `RS-003`, ...
  - Tasks: `T-001`, `T-002`, `T-003`, ... (added later)
- **Status**: Always start with `draft`
- **Timestamps**: Use UTC ISO format (YYYY-MM-DDTHH:MM:SSZ)
- **Resource parsing**: Extract URIs and file paths from HUMAN_DESCRIPTION only. Never add, suggest, or invent additional resources beyond what the human explicitly mentions.
- **Resource initialization**: Only add placeholder entries with "TBD" analysis. Do not fetch, analyze, or process resource content.
- **Task initialization**: Leave tasks section with TODO placeholder. Tasks will be generated after resource analysis.
- **Requirement style**: Phrase requirements as observable outcomes or capabilities (WHAT), never embedding implementation choices (no technology names, data structures, or specific function signatures at this stage).

---

## spec.md structure

```text
---
spec:
  title: "<Title Case Title>"
  slug: "<kebab-case-slug>"
  status: "draft"
  created: "<YYYY-MM-DDTHH:MM:SSZ>"
  updated: "<YYYY-MM-DDTHH:MM:SSZ>"
  version: 1
---

# <Title Case Title>

## Overview
<!-- @section:overview -->
<~120–220 words summarizing HUMAN_DESCRIPTION. End with 3–6 bullet points for key assumptions, constraints, or non-goals if useful.>
<!-- @end -->

## Requirements
<!-- @section:requirements -->
- (R-001) <high-level requirement derived from description>
- (R-002) <high-level requirement derived from description>
<!-- Add more requirements as needed, continuing sequential numbering -->
<!-- @end -->

## Resources
<!-- @section:resources -->
<!-- Only add entries if URIs/paths were explicitly mentioned in HUMAN_DESCRIPTION -->
<!-- If no resources mentioned, leave this section with just these comments -->
- (RS-001) **TBD Title** — Source: <uri-from-description> — Analysis: `resources/<resource-slug>.md` — Summary: TBD
<!-- Add one RS entry per resource URI/path found in human description -->
<!-- @end -->

## Tasks
<!-- @section:tasks -->
<!-- TODO: Will be generated in Step 4 after resource analysis -->
<!-- @end -->
```

---

## Definition of Done

- [ ] `specs/<kebab-case-slug>/` directory created
- [ ] `spec.md` file created with all required sections
- [ ] `resources/` subdirectory created (empty)
- [ ] All section anchors in place for future machine edits
- [ ] Requirements derived from human description (2-5 items typical)
- [ ] Resources section populated only with URIs/paths from description
- [ ] Status set to "draft", timestamps added
- [ ] Ready for Step 2: create_resource (if resources exist)
