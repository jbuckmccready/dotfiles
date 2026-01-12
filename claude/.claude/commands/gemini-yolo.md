---
description: Delegate a task to the Gemini CLI
disable-model-invocation: true
---

Use the Bash tool with a heredoc piped to stdin:

```bash
cat <<'GEMINI_PROMPT' | gemini --model gemini-3-pro-preview -y
[Insert context, code snippets, and user instructions here]
GEMINI_PROMPT
```

**Note:** This command runs with `-y` (auto-approve all tools).

Important:

- **Context is key:** The Gemini CLI starts in a fresh context. If the task requires context from the current conversation (that isn't in a file), you must include it.
- **Avoid redundancy:** Gemini can list and read files independently. Do not paste file contents into the prompt unless the task specifically requires working with in-memory text that doesn't exist on disk.

Here is the task:

$ARGUMENTS
