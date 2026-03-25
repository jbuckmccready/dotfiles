Review $ARGUMENTS for simplification opportunities. List each suggestion with the file path, line range, and a brief explanation of the change. Do not make any changes. All suggestions must preserve existing behavior.

Look for:

- Code duplication that could be merged into shared functions (only if called more than once)
- Dead code, unused imports, or unreachable branches
- Comments that restate what the code already says
- Unnecessary intermediate variables or redundant conditionals
- Over-abstracted wrappers or indirection that only have a single call site
- Complex expressions that could be rewritten more directly
- Code that deviates from the surrounding patterns, abstractions, or style
