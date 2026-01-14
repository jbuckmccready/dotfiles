---
description: Refine spec requirements and description based on resource insights. Identify problems, inconsistencies, and ambiguities.
disable-model-invocation: true
---

# refine_spec

Use the spec-flow-instructions skill if spec flow instructions is not in context before doing anything.

## Purpose

Review the spec with fresh context from resource analysis. Refine the Overview and Requirements for clarity, consistency, and completeness. Surface problems and ask questions about ambiguities, update spec requirements accordingly.

## Input

$ARGUMENTS

Expects: `<SPEC_SLUG> <INSTRUCTIONS>`

- **SPEC_SLUG**: kebab-case spec identifier
- **INSTRUCTIONS**: specific considerations for refinement (optional)

## Output

- Updated `specs/<SPEC_SLUG>/spec.md`:
  - Refined Overview section
  - Refined Requirements section
- Questions surfaced to user (if any ambiguities found)

## Process

### 1. Read Context

- Instructions provided in the input
- `specs/<SPEC_SLUG>/spec.md` — current state
- All files under `specs/<SPEC_SLUG>/resources/*.md` — analysis insights

### 2. Analyze for Issues

Look for:

- **Contradictions**: Requirements that conflict with each other
- **Gaps**: Missing requirements implied by resources but not stated
- **Infeasibility**: Requirements that resources reveal cannot be met
- **Ambiguity**: Vague language that could be interpreted multiple ways
- **Scope creep**: Requirements that exceed original intent
- **Missing context**: Assumptions that need validation

### 3. Ask Questions

If ambiguities or issues found:

- Surface specific questions to the user
- Explain why clarification is needed
- Offer concrete options when possible
- Wait for answers before finalizing refinements

### 4. Refine Spec

Based on resource insights and user answers:

- **Overview**: Clarify scope, purpose, constraints, success criteria
- **Requirements**: Make concrete, testable, feasible
- **No implementation details**: Requirements describe WHAT, not HOW
- **ID preservation**: Keep existing IDs; show traceability for merged items: `(R-002) [merged into R-003]`
- **Obsolete Requirements**: Mark obsolete requirements with `[obsolete]` tag, preserving their content: `(R-002) [obsolete] Original requirement text here`

## Rules

- **Section scope**: Only modify Overview and Requirements sections within the spec file
- **Ask first**: If significant ambiguities exist, ask questions before making changes
- **Be specific**: Questions should be concrete, not open-ended
- **Preserve intent**: Refinements should clarify, not change the user's goals
