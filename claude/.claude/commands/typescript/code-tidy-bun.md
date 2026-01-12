---
description: Tidy up TypeScript code by running type check and formatter using Bun
allowed-tools: Bash(bunx tsc --noEmit), Bash(bunx prettier --write .)
disable-model-invocation: true
---

1. Run type check: `bunx tsc --noEmit`
2. Fix any issues
3. Run type check again to confirm fixed: `bunx tsc --noEmit` (repeat as necessary)
4. Run formatter: `bunx prettier --write .`

**IMPORTANT:** if there are no changes made to fix issues then do not run any tests.

After formatting only respond with "Code tidied."
