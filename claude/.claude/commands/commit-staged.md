---
allowed-tools: Skill(git-commit), Bash(git commit:*)
description: Create a commit of staged changes
disable-model-invocation: true
---

## Context

- Current git status: !`git status`
- Staged changes: !`git diff --cached`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`

## Your task

Use the git-commit skill if git commit skill guidelines not in context, then based on the stanged changes above create a single git commit.

Do not stage any additional files. Do not use any other tools or do anything else. Do not send any other text or messages besides the tool call.
