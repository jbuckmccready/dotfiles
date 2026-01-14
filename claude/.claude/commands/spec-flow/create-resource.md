---
description: Analyze a referenced resource in depth. Creates analysis file and updates spec's Resources section.
disable-model-invocation: true
---

# create_resource

Use the spec-flow-instructions skill if it is not active before doing anything.

## Purpose

Analyze a resource in depth and record findings in a dedicated file. Update the parent spec's Resources section with a summary. Call multiple times for different resources.

## Input

$ARGUMENTS

Expects: `<SPEC_SLUG> <RESOURCE_NAME> <RESOURCE_SOURCE>` (if not provided then it is to be inferred/created from context)

- **SPEC_SLUG**: kebab-case spec identifier
- **RESOURCE_NAME**: human-readable name
- **RESOURCE_SOURCE**: URL, repo path, or identifier

## Output

1. `specs/<SPEC_SLUG>/resources/<resource-slug>.md` — analysis document
2. Updated `specs/<SPEC_SLUG>/spec.md` — Resources section only

## Research Tools

Use appropriate tools to thoroughly research:

- **Web searching** — official documentation, tutorials, authoritative sources
- **Website fetching** — documentation sites, project websites
- **GitHub inspection** — source code, README, issues, release notes
- **API documentation** — official API docs, SDKs, integration guides

Focus on official sources and authoritative documentation.

## Rules

- **Resource slug**: kebab-case from RESOURCE_NAME
- **Focus**: Explain relevance to this spec's requirements (cite R-XXX)
- **Conciseness**: Actionable implementation guidance only, avoid encyclopedic detail
- **Section scope**: Only modify between `<!-- @section:resources -->` and `<!-- @end -->`

## Analysis Document Template

```yaml
---
resource:
  id: "RS-XXX"
  title: "<Resource Name>"
  source: "<Resource Source>"
  spec_slug: "<SPEC_SLUG>"
---
```

```markdown
# <Resource Name>

## Source

<Resource Source>

## Summary

2-3 sentences: what this resource is and why it matters for this spec.

## Key Insights

- Problem this resource solves
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
