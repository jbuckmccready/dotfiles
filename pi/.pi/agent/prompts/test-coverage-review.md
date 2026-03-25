Review $ARGUMENTS for test coverage gaps and quality. This includes:

- Missing control flow coverage: identify branches, match arms, conditionals, loops, and early returns in the source that no test exercises
- Redundant or overlapping tests that can be simplified or condensed without losing coverage
- Critical untested pathways that can cause panics, unhandled errors, or invalid state (e.g. unwrap on None/Err, unchecked index access, unvalidated inputs, missing error propagation)
- Edge cases at boundaries: zero/empty inputs, maximum values, off-by-one scenarios, and type limits

Read the source under test first, map its control flow, then evaluate the existing tests against that map.
