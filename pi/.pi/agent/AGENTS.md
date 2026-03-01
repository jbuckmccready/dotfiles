**Important sandbox context:**

You are running in a sandboxed environment that has restrictions. You may encounter permission errors or enable to find files that you expect to be there. If you encounter such issues, report them clearly and ask for guidance on how to proceed.

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
    - You are working on a greenfield project, do not implement things to avoid breaking API changes, focus on code quality and simplicity.
    - If you write 200 lines and it could be 50, rewrite it.
    - Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
- Keep your changes surgical and focused on the task at hand:
    - Don't "improve" adjacent code, comments, or formatting.
    - Don't refactor things that aren't broken.
    - Match existing style, even if you'd do it differently.
    - If you notice unrelated dead code, mention it - don't delete it.
    - Do remove imports/variables/functions that YOUR changes made unused.
    - Every changed line should trace directly to the user's request.
