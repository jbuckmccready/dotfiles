---
description: Step 2 of 5 in the spec workflow. Analyze a referenced resource in depth and record findings in a dedicated file. Update the parent spec's Resources section with a concise summary.
disable-model-invocation: true
---

# create_resource

## Purpose

**Step 2 of 5** in the spec workflow. Analyze a referenced resource in depth and record findings in a dedicated file. Update the parent spec's Resources section with a concise summary.

**Workflow Order:** initialize_spec → **create_resource** → update_spec → create_tasks → execute_task

---

## Definition of Done

- [ ] Analysis document created at `specs/<SPEC_SLUG>/resources/<resource-slug>.md`
- [ ] Document follows template structure
- [ ] All analysis sections completed with spec-specific insights
- [ ] Spec's Resources section updated with summary entry
- [ ] Resource ID assigned (reuse existing if updating, else next sequential highest+1)
- [ ] Ready for Step 3: update_spec (when all planned resources analyzed)

---

## Inputs

- **SPEC_SLUG** (kebab-case) — which spec this resource belongs to
- **RESOURCE_NAME** (string) — human-readable name for the resource
- **RESOURCE_SOURCE** (URL, repo path, or identifier) — where to find the resource

---

## Research Tools

Use appropriate tools to thoroughly research the resource:

- **Web searching** — Search for official documentation, tutorials, and authoritative technical resources
- **Website fetching** — Fetch content from official documentation sites, project websites, and reliable technical sources
- **GitHub repo inspection** — Examine source code, README files, issues, release notes, and follow links to official documentation
- **API documentation** — Review official API docs, SDKs, and integration guides

Focus on official sources and authoritative documentation.

---

## Outputs

1. `specs/<SPEC_SLUG>/resources/<resource-slug>.md` — analysis document
2. Updated `specs/<SPEC_SLUG>/spec.md` — Resources section only

---

## Rules

- **Resource slug**: kebab-case from RESOURCE_NAME (e.g., "React Native Gifted Chat" → "react-native-gifted-chat")
- **Resource ID allocation**: If updating existing entry, keep its ID. For new entries, find the current highest RS number (e.g., RS-001, RS-004 present → next is RS-005; do not backfill gaps)
- **Timestamps**: On first creation set created & updated to same value (UTC ISO). On edits only bump updated
- **Spec updates**: Only modify between `<!-- @section:resources -->` and `<!-- @end -->`
- **Focus**: Explain relevance to this spec's requirements (cite R-XXX)
- **Conciseness**: Avoid encyclopedic detail—actionable implementation guidance only

---

## Spec Resources Entry Format

```text
- (RS-XXX) **<Resource Name>** — Source: <Resource Source> — Analysis: `resources/<resource-slug>.md` — Summary: <2–3 sentence relevance summary>
```

---

## Analysis Document Template

```text
---
resource:
  id: "RS-XXX"
  title: "<Resource Name>"
  source: "<Resource Source>"
  spec_slug: "<SPEC_SLUG>"
  created: "<YYYY-MM-DDTHH:MM:SSZ>"
  updated: "<YYYY-MM-DDTHH:MM:SSZ>"
---

# <Resource Name>

## Source
<Resource Source>

## Summary
2–3 sentences: what this resource is and why it matters for this specific spec.

## Key Insights
- What problem this resource solves
- Core abstractions and mental models
- Typical usage patterns and workflows
- Integration points and interoperability

## Spec Alignment
- How this resource supports specific requirements (cite R-XXX IDs)
- Which parts are relevant vs. irrelevant for our use case
- Gaps this resource fills or creates

## Implementation Blueprint
- Practical entry points (APIs, CLI tools, SDKs, data flows)
- Key code patterns or configuration examples
- Suggested proof-of-concept or validation approach
- Dependencies and setup requirements

## Risks & Considerations
- Known limitations or pitfalls
- Performance or scalability concerns
- Maintenance and support considerations
- Alternative approaches to consider
```
