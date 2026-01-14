---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Skill(git-commit)
description: Create a git commit
disable-model-invocation: true
---

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged changes): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -10`

## Your task

Use the git-commit skill if git commit skill guidelines not in context, then based on the above changes create a single git commit.

Additional instructions: $ARGUMENTS

You have the capability to call multiple tools in a single response. Stage and create the commit using a single message. Do not use any other tools or do anything else. Do not send any other text or messages besides these tool calls.
