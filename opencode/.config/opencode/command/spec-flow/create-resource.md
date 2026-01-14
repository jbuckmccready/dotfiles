---
description: Analyze a referenced resource in depth. Creates analysis file and updates spec's Resources section.
disable-model-invocation: true
---

# create_resource

Use the spec-flow-instructions skill if spec flow instructions is not in context before doing anything.

## Purpose

Analyze a resource in depth and record findings in a dedicated file. Update the parent spec's Resources section with a summary. Call multiple times for different resources.

## Input

$ARGUMENTS

Expects: `<SPEC_SLUG> <RESOURCE_NAME> <RESOURCE_SOURCE> <INSTRUCTIONS>` (if not provided then it is to be inferred/created from context)

- **SPEC_SLUG**: kebab-case spec identifier
- **RESOURCE_NAME**: human-readable name
- **RESOURCE_SOURCE**: URL, repo path, or identifier
- **INSTRUCTIONS**: specific analysis focus areas or questions (optional)

## Output

- `specs/<SPEC_SLUG>/resources/<resource-slug>.md` — analysis document
- Updated `specs/<SPEC_SLUG>/spec.md` — Resources section only

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
- **Section scope**: Only modify between Resources section in spec file

## Analysis Document Template

Use template at `templates/resource.md` from the spec-flow-instructions skill.
