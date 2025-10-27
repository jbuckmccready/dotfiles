---
name: python-development
description: Instructions for working on Python projects. This skill applies when working on Python projects and needing to format, lint, test, or build Python code.
---

# Development Commands

- **Type Check**: `pyright` (type checking for Python code)
- **Format**: `ruff format .` (format Python code)
- **Lint**: `ruff check .` (lint Python code)
- **Lint with Auto-fix**: `ruff check --fix .` (lint and automatically fix issues)
- **Test**: `pytest` (run tests)
- **Combined Check**: `ruff check --fix . && ruff format . && pyright` (lint, format, and type check)
