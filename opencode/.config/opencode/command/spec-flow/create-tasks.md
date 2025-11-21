# create_tasks

## Purpose
**Step 4 of 5** in the spec workflow. Generate concrete, bite-sized tasks that, when completed, will satisfy all spec requirements. Each task must be actionable, traceable to requirements, and scoped for coding agents to implement.

**Workflow Order:** initialize_spec → create_resource → update_spec → **create_tasks** → execute_task

---

## Inputs
- **SPEC_SLUG** (kebab-case) — which spec to generate tasks for

---

## Outputs
- Updated `specs/<SPEC_SLUG>/spec.md` — Tasks section only (other sections preserved)

---

## Rules
- **Read first**:
  - `specs/<SPEC_SLUG>/spec.md` — current requirements and context
  - All files under `specs/<SPEC_SLUG>/resources/*.md` — implementation guidance
  - **Inspect the codebase** — understand current structure, patterns, file locations, component names, etc.
- **Requirement coverage**: Every active requirement (R-XXX) must map to at least one task
- **Task specificity**: Tasks must be targeted code changes, not general work items
  - Include specific file paths, component names, function signatures
  - Reference existing code patterns and variable names
  - Provide concrete code snippets or examples when helpful
- **Task sizing**: Small, demonstrable slices (1–3 hours of work ideal)
- **Task independence**: Keep tasks independent when possible; mark dependencies explicitly when needed
- **Task IDs**: Sequential numbering T-001, T-002, T-003, ...
  - Preserve existing task IDs if updating
  - Append new tasks with next sequential numbers (find highest number and add 1; do not backfill gaps)
  - Example: If T-001, T-004 exist, next new task is T-005
- **Section scope**: Only modify Tasks section between `<!-- @section:tasks -->` and `<!-- @end -->` anchors
- **Traceability**: Reference requirement IDs (R-XXX) in task overviews for clear mapping
- **Status markers**: Each task header may include an optional status tag in square brackets: `[pending]`, `[in-progress]`, `[done]`, `[blocked <reason>]`. When a task is completed (after execution), update its header to `[done YYYY-MM-DDTHH:MM:SSZ]` (UTC ISO). When blocked, use `[blocked reason-description]`. Do not add extra metadata blocks.

---

## Task Template

Each task is a Markdown subsection with three parts:

```text
### <Task Title> (T-XXX) [pending]

#### Overview
Short explanation: what this task accomplishes, why it matters for the spec, and which requirement(s) it addresses (reference R-XXX IDs). Include general approach or strategy.

#### Acceptance Criteria
- <specific, verifiable outcome that can be tested>
- <demo-able result that proves completion>
- <measurable signal of success>

#### Implementation Details
- **Specific files to modify**: `path/to/component.tsx`, `path/to/service.ts`
- **Key functions/components to change**: `ComponentName`, `functionName()`, `CONSTANT_NAME`
- **Code patterns to follow**: Reference existing patterns found in codebase
- **Integration points**: Specific props, hooks, context, or API calls to use
- **Example code snippets**: Brief examples showing expected structure
- **Testing approach**: How to verify the change works (specific test files or manual steps)
```

---

## Tasks Section Update

```text
## Tasks
<!-- @section:tasks -->
### <Task Title> (T-001) [pending]

#### Overview
Addresses requirement R-XXX by... [explanation and approach]

#### Acceptance Criteria
- [verifiable outcome]
- [demo-able result]

#### Implementation Details
- **Files to modify**: `packages/mobile/src/components/ExampleComponent.tsx`
- **Functions to change**: `handleSubmit()`, `validateInput()`
- **Patterns to follow**: Similar to existing `OtherComponent.tsx` implementation
- **Integration**: Use `useWalletContext()` hook, call `walletService.performAction()`
- **Testing**: Manual test in dev app, verify console output shows expected result

### <Next Task Title> (T-002) [pending]

#### Overview
Addresses requirements R-YYY and R-ZZZ by... [explanation]

#### Acceptance Criteria
- [verifiable outcome]

#### Implementation Details
- **Files to modify**: [specific file paths from codebase inspection]
- **Components to change**: [actual component names found in codebase]
- **Code examples**: [brief snippets showing expected structure]
<!-- @end -->
```

---

## Definition of Done
- [ ] **Codebase inspected** to understand existing patterns, file structures, and relevant implementations
- [ ] Tasks section completely populated with all required tasks
- [ ] Every requirement (R-XXX) covered by at least one task
- [ ] Each task properly scoped (1-3 hours of work) and targeted to specific code changes
- [ ] All tasks include concrete acceptance criteria
- [ ] **Implementation details are specific**:
  - [ ] Actual file paths from the codebase included
  - [ ] Real component/function names referenced
  - [ ] Existing code patterns identified and referenced
  - [ ] Integration points clearly specified
- [ ] Task dependencies clearly marked when present
- [ ] Sequential task IDs assigned (T-001, T-002, ...)
- [ ] No changes made outside Tasks section
- [ ] Spec is now ready for implementation by coding agents
