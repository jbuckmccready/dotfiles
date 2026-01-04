---
description: Perform a thorough code review of currently staged changes
subtask: false
---

# review-staged

Review the currently staged changes in the working directory.

Additional instructions: $ARGUMENTS

---

## Requirements

- Git repository with staged changes.
- Current working directory is within the repository.

---

## Phase 1: Staged Changes Retrieval

Gather staged file information:

```bash
# Get list of staged files
git diff --cached --name-only

# Get staged diff stats
git diff --cached --stat
```

From the staged files, **filter out**:

- Lockfiles: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, etc.
- Minified files: `*.min.*`
- Source maps: `*.map`
- Large generated or binary assets: images, fonts, compiled bundles, etc.

Extract:

- **Changed file paths**: To scope context gathering
- **Stats**: Additions/deletions per file

---

## Phase 2: Staged Diff Analysis

Generate the staged diff. **Crucial**: Filter out lock files to avoid context window issues.

```bash
git diff --cached -- . ':(exclude)package-lock.json' ':(exclude)yarn.lock' ':(exclude)pnpm-lock.yaml' ':(exclude)Cargo.lock' ':(exclude)*.lock' ':(exclude)bun.lock'
```

Use this filtered staged diff for your analysis.

If the diff is too large or truncated, diff files individually:

```bash
# Get list of staged files (excluding lock files)
git diff --cached --name-only -- . ':(exclude)*.lock' ':(exclude)package-lock.json' ':(exclude)yarn.lock' ':(exclude)pnpm-lock.yaml' ':(exclude)Cargo.lock' ':(exclude)bun.lock'

# Then diff each file separately
git diff --cached -- path/to/file.ts
```

Process files in priority order: core logic and public APIs first, tests and ancillary files later.

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

### 3.3 Documentation Context

Search for and read:

- README.md files in affected directories
- Doc comments on modified functions/classes/types
- Relevant design docs or ADRs if they exist

### 3.4 Test Context

- Examine existing tests for modified code
- Understand the testing patterns used in the codebase
- Note whether new tests were added or existing tests modified

### 3.5 Change History Context

- Check `git log` for recent changes to modified files
- Use `git blame` on complex sections to understand evolution
- Note if changes touch recently modified code (potential conflicts or churn)

### 3.6 Proactive Verification

- **Run Linters/Type-checkers**: Identify and execute the project's linting and static analysis tools (e.g., `npm run lint`, `tsc`, `ruff check`, `cargo check`).
- **Run Relevant Tests**: Identify and execute unit or integration tests affected by the changes. Focus on tests for the modified files.
- **Analyze Results**: Capture any errors, warnings, or test failures. These should be treated as high-priority findings in the final review.

---

## Phase 4: Code Review

Analyze the changes systematically across these dimensions:

### 4.1 Correctness and Bugs

- **Verification Failures**: Prioritize any linting errors, type-checking failures, or broken tests found in Phase 3.6.
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

2-3 sentences describing what these staged changes do, the overall quality/risk assessment,
and any notably well-designed aspects.

### Strengths (Optional)

If there are notably well-designed aspects, list a brief bullet summary (e.g., clear abstractions, good tests, simplified logic). Otherwise, you may omit this section.

### Changes Overview

Bullet list of the key changes made, organized by area or file.

### Verification Results

Summary of any automated checks performed:
- **Linters/Type-checkers**: Results and any warnings/errors.
- **Tests**: List of tests run and their status (Pass/Fail).

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

- **File Output**: Write the full review report to a file named `staged-review.md` in the current working directory.
- **Chat Output**: Print the **Summary** and any **Critical/Major** issues directly to the chat for immediate visibility. Include **Strengths** in chat output only if you generated that section.
- Be specific: Reference exact file paths and line numbers
- Be actionable: Provide concrete suggestions, not vague concerns
