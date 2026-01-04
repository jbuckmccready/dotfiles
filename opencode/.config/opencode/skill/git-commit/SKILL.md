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

### ❌ Bad Commit Messages

**Example 1: Too verbose with unnecessary explanations**

```
fix(api): prevent null pointer in user lookup

I noticed that when users try to look up a profile that doesn't exist,
we were getting crashes. This was happening because the old developer
didn't add proper validation. I decided to fix this by adding a check
to see if the user exists first before trying to access their data.
This is important because we don't want the app to crash.
```

_Why bad: Over-explains obvious reasoning, includes unnecessary backstory_

**Example 2: Vague and non-descriptive**

```
update stuff

- changed some files
- fixed things
```

_Why bad: No useful information about what actually changed_

**Example 3: Lists every file change**

```
feat(ui): update dashboard

- Modified Dashboard.tsx line 42
- Changed Button.tsx line 15
- Updated styles.css line 203
- Fixed typo in Header.tsx line 8
```

_Why bad: Describes "what" at too low a level instead of the meaningful changes_

**Example 4: Missing context for complex change**

```
refactor(auth): change token validation
```

_Why bad: Should explain WHY this subtle change matters (e.g., "use RS256 instead of HS256 for better security")_

**Example 5: Overly technical without the "so what"**

```
fix(db): update sequelize query

Changed findOne to findByPk in UserModel.getById
```

_Why bad: Technical detail without explaining the impact or reason_
