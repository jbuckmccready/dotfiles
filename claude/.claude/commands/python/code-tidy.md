---
description: Tidy up Python code by running type check, linter and formatter
allowed-tools: Bash(pyright), Bash(ruff check --fix .), Bash(ruff format .)
---

1. Run type check: `pyright`
2. Fix any issues
3. Run type check again to confirm fixed: `pyright` (repeat as necessary)
4. Run linter with auto-fix: `ruff check --fix .`
5. Fix any issues
6. Run linter again to confirm fixed: `ruff check .` (repeat as necessary)
7. Run formatter: `ruff format .`

**IMPORTANT:** if there are no changes made to fix issues then do not run any tests.

After formatting only respond with "Code tidied."
