---
description: Step 5 of 5 in the spec workflow. Execute one specific task from the spec's Tasks section, implementing only the scoped changes described and verifying acceptance criteria.
disable-model-invocation: true
---

# execute_task

## Purpose

**Step 5 of 5** in the spec workflow. Execute one specific task from the spec's Tasks section, implementing only the scoped changes described and verifying acceptance criteria.

**Workflow Order:** initialize_spec → create_resource → update_spec → create_tasks → **execute_task**

---

## Inputs

- **SPEC_SLUG** (kebab-case) — which spec this task belongs to
- **TASK_ID** (T-XXX format) — which specific task to execute

---

## Outputs

- Code changes as specified in the task's implementation details
- Updated task header status in the spec (`[done YYYY-MM-DDTHH:MM:SSZ]`)
- Verification that acceptance criteria are met (recorded in execution summary)

---

## Rules

- **Read first**:
  - `specs/<SPEC_SLUG>/spec.md` — find the specific task (T-XXX)
  - All files under `specs/<SPEC_SLUG>/resources/*.md` — implementation context
  - **Current codebase state** — understand what exists before making changes
- **Task focus**: Implement exactly what the task specifies, no more, no less
- **Follow patterns**: Use existing code patterns and conventions found in the codebase
- **Incremental changes**: Make small, targeted changes as specified in the task
- **Verify acceptance criteria**: Ensure all acceptance criteria are met before completion
- **Test changes**: Run any tests or manual verification steps mentioned in the task
- **Error handling**: If implementation reveals issues with the task definition, document them clearly
- **Task status update**: After successful completion, modify the task heading to append or replace status tag with `[done <UTC ISO timestamp>]`. If blocked, use `[blocked <reason>]` without altering original acceptance criteria.
- **Scope discipline**: If needed changes exceed task scope, stop and document instead of expanding implementation.

---

## Implementation Process

### 1. Task Analysis

- Read the specific task (T-XXX) from the spec
- Understand what requirement(s) it addresses (R-XXX references)
- Review acceptance criteria for success definition
- Parse implementation details for specific changes needed

### 2. Codebase Inspection

- Examine current state of files mentioned in implementation details
- Understand existing patterns, naming conventions, and structure
- Identify any dependencies or integration points
- Check for potential conflicts with other code

### 3. Implementation

- Make the specific code changes described in the task
- Follow the file paths, component names, and patterns specified
- Use the integration points and APIs mentioned in implementation details
- Apply code snippets or examples provided in the task

### 4. Verification

- Test the changes according to the task's testing approach
- Verify each acceptance criterion is met
- Run any automated tests that might be affected
- Perform manual testing if specified

### 5. Documentation

- Update any relevant documentation if the task specifies it
- Add comments to code if the changes are complex
- Document any deviations from the original task plan

### 6. Execution Summary (append to end of task subsection)

Add a short "Execution Summary" block listing: changed files, acceptance criteria pass/fail list, test commands run, notes.

---

## Success Indicators

- All acceptance criteria from the task are demonstrably met
- Code follows existing patterns and conventions
- No breaking changes to unrelated functionality
- Tests pass (automated and manual as specified)
- Changes align with the broader spec requirements

---

## Failure Handling

If the task cannot be completed as written:

- **Document the issue clearly**: What specifically cannot be implemented and why
- **Suggest task refinement**: How the task should be modified to be implementable
- **Partial implementation**: If some parts can be completed, implement those and document what's missing
- **Escalate**: Flag for human review if the issue affects other tasks or spec requirements

---

## Execution Summary Format (Example)

```text
Execution Summary (T-00X):
Date: 2025-09-14T15:42:10Z
Status: done
Files Changed (3):
- packages/mobile/src/.../Example.tsx
- packages/agent-service/src/.../handler.ts
- specs/ai-agent-chat/spec.md (task header status only)
Acceptance Criteria:
- Criterion 1: PASS
- Criterion 2: PASS
Tests: 12 passed (unit), 1 manual verification (screenshot captured)
Notes: No side effects detected; performance unchanged.
```

---

## Definition of Done

- [ ] Task (T-XXX) located and analyzed from the spec
- [ ] Current codebase state inspected and understood
- [ ] All specified code changes implemented
- [ ] Implementation follows existing code patterns and conventions
- [ ] All acceptance criteria verified and met
- [ ] Testing completed as specified in the task
- [ ] No breaking changes introduced to unrelated functionality
- [ ] Any issues or deviations documented clearly
- [ ] Ready for next task execution or spec completion

```

```
