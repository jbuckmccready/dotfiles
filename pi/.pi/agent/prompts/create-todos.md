Use the `todo` tool to create TODOs $ARGUMENTS, the created TODOs must:

- Be a single coherent unit of work (one focused session, not a multi-day epic)
- Have a clear, actionable title and body understandable without session context
- Include references to files and line numbers where relevant for context
- Include any known implementation and intent details and have as much relevant information as is helpful
- Include acceptance criteria for being done (e.g., "tests pass", "UI loads images", "user verifies X")
- Include any dependency on other TODOs by referencing their id and title
- Be tagged appropriately for the work to be done (e.g., "research", "implementation", "testing")
- Have no dependency on current session context - TODOs must be understandable and executable in the future without the current session context

Create foundational TODOs first so dependent ones can reference their IDs.
For anything requiring investigation, create a research TODO first, then dependent implementation TODOs that reference it.
