---
description: Create a new shortcut story
---

Use the Skill(shortcut) to perform all operations related to shortcut stories and branches.

Create a new shortcut story based on the following input:
<input>
$ARGUMENTS
</input>

Example title inputs:
- feat(edge-gatway): add v2 rate limiting
- bug(staked-tx-relay): fix deadlock under high load

Input should follow something like this (may be slightly different, you must interpret it):
```
title="feat(edge-gatway): add v2 rate limiting" owner="Alice"
```

From the input, fill the following details for the sortcut story:
Title: [from input] (IMPORTANT: it should include the exact title as given including type and scope, e.g., "feat(edge-gatway): add v2 rate limiting")
Team: Infra Team (IMPORTANT: must use id for the team)
Owner: [from input, default to current user if unspecified in input, IMPORTANT: must use id for the owner]
Requester: [current user, IMPORTANT: must use id for the requester]
Type: [set based on title if unspecified in input, allowed: feature, bug, or chore]
Iteration: [from input, default to the currently started iteration across all teams if unspecified in input]

Create a new shortcut story with the above details and return the story URL.
