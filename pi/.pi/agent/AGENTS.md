**Important sandbox context:**

You are running in a sandboxed environment that only allows writes to the current directory `.` and `/tmp`. Upon encountering any permission errors do not attempt a workaround, instead inform the user of the problem and what you are attempting to do.

**Coding guidelines:**

- When editing comments, or documentation, never refer to previous versions of the code that no longer exist — only describe the current state.
- Think before implementing:
    - State your assumptions explicitly. If uncertain, ask.
    - If multiple interpretations exist, present them - don't pick silently.
    - If a simpler approach exists, say so. Push back when warranted.
    - If something is unclear, stop. Name what's confusing. Ask.
- When tasked with implementing new features, or making fixes, always use the minimum code that solves the problem:
    - No features beyond what was asked.
    - No abstractions for single-use code.
    - No "flexibility" or "configurability" that wasn't requested.
    - No error handling for impossible scenarios.
    - If you write 200 lines and it could be 50, rewrite it.
    - Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
- Keep your changes surgical and focused on the task at hand:
    - Don't "improve" adjacent code, comments, or formatting.
    - Don't refactor things that aren't broken.
    - Match existing style, even if you'd do it differently.
    - If you notice unrelated dead code, mention it - don't delete it.
    - Do remove imports/variables/functions that YOUR changes made unused.
    - Every changed line should trace directly to the user's request.
