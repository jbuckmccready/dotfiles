From this session organize a summary list of initial points of confusion or distractions that could have been clarified up front in future sessions for better efficiency (less back-and-forth with the user and/or less tool invocations).

Example points of confusion/distraction:

- You were initially unable to compile, run, or test the codebase (bash command expected to work failed, or user had to clarify what to do).
- Documentation was missing or unclear, and you had to ask the user for clarification.
- It was unclear what the context for user requests was, and you had to ask the user for clarification or broadly search for context.
- Tools didn't work as expected (errored, missing, or had unexpected output), leading to more trial and error, or the user had to step in to clarify how to use them.
- You made incorrect assumptions about architecture or conventions and had to backtrack.
- You over-engineered or under-engineered a solution and needed correction.

For each point of confusion or distraction, use this format:

```md
### Issue: <one-line summary>

- **Category:** project docs/config | agent behavior | environment/tooling
- **Wasted effort:** <estimated extra turns or tool calls spent>
- **What happened:** <brief description>
- **Impact:** <how it affected the session>
- **Fix:** <suggestion for how to prevent this in future sessions>
```
