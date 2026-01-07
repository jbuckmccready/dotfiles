---
description: Create a commit of staged changes
agent: git-committer
subtask: false
---

## Context

- Current git status: !`git status`
- Staged changes: !`git diff --cached`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`

## Your task

Based on the staged changes above, use the git-commit skill to create a single git commit.

Do not stage any additional files. Do not use any other tools or do anything else. Do not send any other text or messages besides the tool call.
