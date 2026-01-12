---
name: git-commit
description: MUST use when committing changes to a git repository, contains guidelines for creating git commit messages
---

**IMPORTANT**: you must follow the commit message format and guidelines.

## Before Creating the Commit

- Use read based git commands to understand the current state of the repository for any requested commits.
- Minimize git commands used to only what is necessary to understand context for creating the commit.
- Check for any accidentally staged files.
- Ensure commit message and description adheres to the guidelines below.

## Commit Message Format

Use conventional commit format: `type(scope): subject`

**Common types:** feat, fix, refactor, perf, docs, test, chore, style

**Guidelines:**

- Keep subject line under 72 characters
- For simple changes, the subject line may be sufficient
- Add a body when changes involve multiple files or need explanation
- Limit body to 3-5 bullet points for most commits
- **IMPORTANT**: avoid extra newlines/bank lines between bullet points

## When to Include WHY (Not Just WHAT)

Include reasoning only when:

- Security implications exist
- Performance trade-offs were made
- The change fixes a non-obvious bug
- Breaking changes or migration steps are needed
- The approach chosen could be confusing without context

Otherwise, focus on describing WHAT changed **concisely**.

## Examples

### ✅ Good Commit Messages

**Example 1: Feature addition**

```
feat(auth): add OAuth2 authentication support

- Implement OAuth2 provider integration
- Add token refresh mechanism
- Create middleware for protected routes
```

**Example 2: Bug fix**

```
fix(api): prevent null pointer in user lookup

Handle case where user ID doesn't exist in database
```

**Example 3: Refactor**

```
refactor(payments): extract Stripe logic into service layer

- Move API calls to PaymentService
- Simplify controller methods
- Add error handling helpers
```

**Example 4: Performance improvement**

```
perf(search): add caching layer for search queries

Reduces average query time from 200ms to 15ms
```
