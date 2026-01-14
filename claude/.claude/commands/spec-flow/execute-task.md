---
description: Execute one specific task from the spec's Tasks section. Implements scoped changes and verifies acceptance criteria.
disable-model-invocation: true
---

# execute_task

Use the spec-flow-instructions skill if it is not active before doing anything.

## Purpose

Execute one specific task from the spec's Tasks section. Implement only the scoped changes and verify acceptance criteria. Call multiple times for different tasks.

## Input

$ARGUMENTS

Expects: `<SPEC_SLUG> <TASK_ID>` (may be multiple `<TASK_ID`, if argument not provided then it is to be inferred/created from context)

- **SPEC_SLUG**: kebab-case spec identifier
- **TASK_ID**: T-XXX format task identifier

## Output

- Code changes as specified in task's implementation details
- Updated task status: `[done]`
- Execution summary appended to task

## Process

### 1. Task Analysis

- Read specific task (T-XXX) from spec
- Understand which requirements it addresses (R-XXX)
- Review acceptance criteria
- Parse implementation details

### 2. Codebase Inspection

- Examine current state of files in implementation details
- Understand existing patterns and conventions
- Identify dependencies and integration points

### 3. Implementation

- Make specific code changes described in task
- Follow file paths, component names, patterns specified
- Use integration points and APIs mentioned
- Apply code snippets or examples from task

### 4. Verification

- Test per task's testing approach
- Verify each acceptance criterion
- Run affected automated tests
- Perform manual testing if specified

### 5. Documentation

- Update task status to `[done]`
- Append execution summary to task

## Rules

- **Task focus**: Implement exactly what the task specifies, no more, no less
- **Follow patterns**: Use existing code patterns and conventions
- **Scope discipline**: If needed changes exceed task scope, stop and document
- **No breaking changes**: Avoid affecting unrelated functionality

## Failure Handling

If task cannot be completed:

- **Document issue**: What specifically cannot be implemented and why
- **Suggest refinement**: How task should be modified
- **Partial implementation**: Complete what's possible, document what's missing
- **Update status**: Use `[blocked <reason>]` instead of `[done]`

## Execution Summary

Append to task after completion:

```markdown
Execution Summary (T-XXX):
Files Changed (N):

- path/to/file.ts
- path/to/other.ts
  Acceptance Criteria:
- Criterion 1: PASS
- Criterion 2: PASS
  Tests: [results]
  Notes: [observations]
```
