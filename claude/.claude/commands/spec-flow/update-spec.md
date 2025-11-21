# update_spec

## Purpose
**Step 3 of 5** in the spec workflow. Refine a spec's Overview and Requirements after resources have been analyzed. The goal is to make the spec sharper, more accurate, and implementation-ready, informed by resource analysis insights.

**Workflow Order:** initialize_spec → create_resource → **update_spec** → create_tasks → execute_task

---

## Inputs
- **SPEC_SLUG** (kebab-case) — which spec to update

---

## Outputs
- Updated `specs/<SPEC_SLUG>/spec.md` — Overview and Requirements sections only (other sections preserved)

---

## Rules
- **Read first**:
  - `specs/<SPEC_SLUG>/spec.md` — current state
  - All files under `specs/<SPEC_SLUG>/resources/*.md` — analysis insights
- **Update scope**: Only modify Overview and Requirements sections between their anchors
- **Overview improvements**: Clear scope, purpose, constraints, success criteria based on resource insights
- **Requirements refinement**: Concrete but high-level goals, testable and unambiguous, informed by what's actually possible/recommended from resources
- **No implementation details**: Do not write tasks or implementation steps — that comes in Step 4
- **ID preservation**:
  - Keep existing requirement IDs when possible (R-001, R-002, ...)
  - For merged/replaced requirements, show traceability: `(R-002) [merged into R-003]`
  - Add new requirements with next sequential IDs
- **Section integrity**: Keep all section anchors intact for machine editing

---

## Update Template

### Overview Section
```text
## Overview
<!-- @section:overview -->
<~200–350 words, refined based on resource analysis insights. Explain:
- What this spec accomplishes and why it matters
- Scope boundaries informed by what resources can/cannot provide
- Key constraints or assumptions discovered through analysis
- Success criteria that are actually achievable>

Key considerations:
- <bullet point for important assumption>
- <bullet point for constraint or limitation>
- <bullet point for non-goal or out-of-scope item>
<!-- @end -->
```

### Requirements Section
```text
## Requirements
<!-- @section:requirements -->
- (R-001) <requirement text, refined with resource insights>
- (R-002) <requirement text, updated for feasibility>
- (R-003) <new requirement discovered through analysis>
<!-- Continue sequential numbering -->
<!-- Show traceability for merged/removed: (R-XXX) [merged into R-YYY] -->
<!-- @end -->
```

---

## Definition of Done
- [ ] Overview section rewritten with resource analysis insights
- [ ] Requirements updated to be testable and feasible based on analyzed resources
- [ ] All requirement IDs preserved or properly traced
- [ ] Scope boundaries clarified based on what resources can deliver
- [ ] Key assumptions and constraints identified from resource analysis
- [ ] No changes made outside Overview and Requirements sections
- [ ] Ready for Step 4: create_tasks
