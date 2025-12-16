---
description: Perform a thorough code review of a GitHub Pull Request
---

# review-pr

Review the GitHub Pull Request specified by `$ARGUMENTS` (accepts PR URL or number).

---

## Requirements

- `gh` CLI is installed and authenticated.
- Current working directory is the PR's repository.
- `$PR` is resolved from `$ARGUMENTS` (PR URL or number).

---

## Phase 1: PR Information Retrieval

Use `gh` CLI to gather all PR metadata and changes:

```bash
# Get PR metadata and changed files in one call
gh pr view "$PR" \
  --json title,body,baseRefName,headRefName,state,additions,deletions,changedFiles,files,number,statusCheckRollup
```

From the `files` field, derive the list of changed file paths and **filter out**:

- Lockfiles: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, etc.
- Minified files: `*.min.*`
- Source maps: `*.map`
- Large generated or binary assets: images, fonts, compiled bundles, etc.

Extract:

- **Title and description**: Understand the stated intent
- **Base and head branches**: For local checkout
- **Changed file paths**: To scope context gathering
- **CI status** (via `statusCheckRollup`): To understand test/check health

---

## Phase 2: Local Checkout and Diff

1. Checkout the PR branch locally:

```bash
gh pr checkout "$PR"
```

2. Generate the diff locally against the base branch (retrieved in Phase 1). **Crucial**: Filter out lock files to avoid context window issues.

```bash
# Use the base branch name from Phase 1 (e.g., origin/main or origin/develop)
# If the base branch is not locally available, fetch it first:
git fetch origin "$BASE_BRANCH"
git diff "origin/$BASE_BRANCH"...HEAD -- . ':(exclude)package-lock.json' ':(exclude)yarn.lock' ':(exclude)pnpm-lock.yaml' ':(exclude)Cargo.lock' ':(exclude)*.lock'
```

Use this filtered local diff for your analysis.

3. **If the diff is too large or truncated**, diff files individually:

```bash
# Get list of changed files (excluding lock files)
git diff --name-only "origin/$BASE_BRANCH"...HEAD -- . ':(exclude)*.lock' ':(exclude)package-lock.json' ':(exclude)yarn.lock' ':(exclude)pnpm-lock.yaml' ':(exclude)Cargo.lock'

# Then diff each file separately
git diff "origin/$BASE_BRANCH"...HEAD -- path/to/file.ts
```

Process files in priority order: core logic and public APIs first, tests and ancillary files later. For very large PRs, consider spawning parallel agents to review subsets of files.

---

## Phase 3: Deep Context Gathering

**Spawn agents as needed** (e.g., exploration-focused agents for broad codebase
searches and reasoning-focused agents for cross-file analysis) to gather
comprehensive context. Prioritize understanding over speed.

### 3.1 Direct Change Analysis

For each changed file (excluding filtered files):

- For small and medium-sized files, read the complete file (not just the diff)
  to understand full context.
- For very large files (>1000 lines) with localized diffs, read:
  - The diff hunk(s)
  - ~50–100 lines of surrounding context
  - Any related helper functions/types used by the changed code
- Identify the module/component/layer the file belongs to
- Note imports, exports, and dependencies

### 3.2 Related Code Analysis

For modules affected by changes:

- Identify tightly coupled modules (files that import from or are imported by changed files)
- Analyze how changes might affect consumers of modified APIs/functions/types
- Check for similar patterns elsewhere that might need consistent updates
- For very large PRs, prioritize modules that:
  - Touch core business logic or shared infrastructure
  - Have failing CI checks associated with them
  - Introduce new public APIs

### 3.3 Documentation Context

Search for and read:

- README.md files in affected directories
- Doc comments on modified functions/classes/types
- Any linked documentation in the PR description
- Relevant design docs or ADRs if they exist

### 3.4 Test Context

- Examine existing tests for modified code
- Understand the testing patterns used in the codebase
- Note whether new tests were added or existing tests modified

### 3.5 Change History Context

- Check `git log` for recent changes to modified files
- Use `git blame` on complex sections to understand evolution
- Note if changes touch recently modified code (potential conflicts or churn)

### 3.6 CI and Test Status

- Use `statusCheckRollup` from `gh pr view` to inspect CI results.
- Note failing or pending checks and include them in the review Summary.
- If feasible and appropriate, identify which areas the failing checks relate to
  (e.g., unit tests vs. integration/e2e).

---

## Phase 4: Code Review

Analyze the changes systematically across these dimensions:

### 4.1 Correctness and Bugs

- Assume basic compilation and type checks pass; focus primarily on logical correctness and behavior
- Logic errors or off-by-one mistakes
- Null/undefined handling issues
- Race conditions or concurrency problems
- Edge cases not handled
- Error handling gaps (uncaught exceptions, missing error propagation)
- Resource leaks (unclosed handles, missing cleanup)

### 4.2 Unintended Consequences

- Breaking changes to public APIs
- Behavioral changes to existing functionality
- Side effects on other modules or systems
- Data migration or backwards compatibility issues
- Security implications (injection vulnerabilities, auth bypasses, data exposure)

### 4.3 Code Quality

- Code duplication that could be extracted
- Naming clarity (variables, functions, types)
- Function/method length and complexity
- Nesting depth and control flow clarity
- Separation of concerns
- Consistency with existing codebase patterns
- Dead code or unused imports

### 4.4 Readability and Maintainability

- Missing or inadequate comments for complex logic
- Unclear intent that needs documentation
- Magic numbers or strings that should be constants
- Overly clever code that sacrifices clarity
- Inconsistent formatting (if not auto-formatted)

### 4.5 Performance (Low-Hanging Fruit Only)

Focus on obvious issues, not premature optimization:

- Inefficient data structures for the use case (e.g., array when set/map needed)
- Unnecessary allocations in hot paths
- N+1 query patterns
- Missing memoization for expensive repeated calculations
- Synchronous blocking where async is appropriate
- Unbounded loops or polling without backoff

---

## Phase 5: Review Report

Present a structured review with the following sections:

### Summary

2-3 sentences describing what this PR does, the overall quality/risk assessment,
and any notably well-designed aspects.

### Strengths (Optional)

If there are notably well-designed aspects, list a brief bullet summary (e.g., clear abstractions, good tests, simplified logic). Otherwise, you may omit this section.

### Changes Overview

Bullet list of the key changes made, organized by area or file.

### Issues Found

For each issue, provide:

- **Location**: `file_path:line_number`
- **Severity**: Critical / Major / Minor / Nitpick
- **Category**: Bug | Unintended Consequence | Code Quality | Readability | Performance
- **Description**: What the issue is
- **Suggestion**: How to fix it (with code snippet if helpful)

Severity definitions:

- **Critical**: Likely to cause production incidents, data loss, or security vulnerabilities
- **Major**: Significant bugs, breaking changes, or substantial quality issues
- **Minor**: Non-optimal patterns, minor bugs with limited impact, clarity improvements
- **Nitpick**: Style preferences, minor naming suggestions, optional improvements

### Questions

List any questions about intent or implementation choices that would help complete the review.

---

## Output Guidelines

- **File Output**: Write the full review report to a file named `pr-review-{PR-number}.md` where `{PR-number}` is the actual PR number (e.g., `pr-review-1234.md`). Derive `{PR-number}` from the `number` field of `gh pr view "$PR" --json number` rather than parsing the URL manually.
- **Chat Output**: Print the **Summary** and any **Critical/Major** issues directly to the chat for immediate visibility. Include **Strengths** in chat output only if you generated that section.
- Be specific: Reference exact file paths and line numbers
- Be actionable: Provide concrete suggestions, not vague concerns
