Review $ARGUMENTS for memory safety and ownership issues. Do not make changes.

Focus on defects that can cause:

- Use-after-free, dangling pointer, stale reference, or iterator invalidation
- Double free, invalid free, mismatched allocator or deallocator, or ownership transfer ambiguity
- Memory leak from missing cleanup, lost ownership, reference cycles, forgotten cancellation paths, or partial initialization failure
- Out-of-bounds read or write, buffer overflow, underflow, or unchecked length arithmetic
- Uninitialized read, partially initialized object use, or invalid lifetime extension
- Aliasing violations, mutable shared state without synchronization, data races, or thread lifetime issues
- Resource ownership leaks for files, sockets, locks, handles, buffers, arenas, pools, or foreign resources
- FFI boundary mistakes, including invalid pointer provenance, wrong lifetime contract, missing null checks, or ownership mismatch across languages

Method:

1. Identify every allocation, borrowed reference, pointer, handle, and ownership transfer in $ARGUMENTS.
2. Trace each object's lifetime from creation through all exit paths, including errors, early returns, exceptions, panics, callbacks, cancellation, and concurrent access.
3. Verify each owned resource has exactly one cleanup path and no access after cleanup.
4. Verify borrowed references never outlive the owner and are not used after mutation, reallocation, move, free, close, or drop.
5. Check loops, container mutation, resize operations, cache invalidation, async boundaries, and thread handoff for stale references.
6. For diffs, compare old and new lifetime behavior. Flag newly introduced risks and removed safeguards.

Output findings only. For each finding include:

- Severity: critical, high, medium, or low
- File path and line range
- Issue type
- Ownership or lifetime trace that proves the issue
- Minimal fix direction

If no issues found, say so and list the main ownership paths reviewed.
