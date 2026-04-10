I am in the middle of a git merge or rebase and want you to handle it carefully.

Tasks:

1. Detect whether a merge or rebase is in progress
2. Analyze the operation in progress
3. List and summarize all conflicts
4. Identify any additional non-conflict changes needed to complete the operation cleanly
5. Produce a detailed resolution plan for each conflict (do not edit any files)

Do not edit files or run `git add`, `git merge --continue`, `git rebase --continue`, `git rebase --skip`, or `git rebase --abort`. Output a plan that can be executed to resolve the conflicts.

Important conflict-resolution rules:

- Do not blindly prefer ours or theirs
- First identify the operation type
- If this is a merge, identify:
    - current branch HEAD
    - incoming branch commit (`MERGE_HEAD`)
    - merge base
- If this is a rebase, identify:
    - the commit currently being replayed (`REBASE_HEAD` if available)
    - the rebase target / onto commit
    - the original branch being rebased if available
    - merge base between the replayed commit and the onto side
- For each conflicted file, compare:
    - merge base version
    - destination side version (merge: current branch HEAD, rebase: upstream / onto side)
    - incoming change version (merge: `MERGE_HEAD`, rebase: replayed commit / `REBASE_HEAD`)
- Preserve the newest intentional changes from the side that actually changed the code after the merge base
- Be especially careful not to accidentally revert current-branch-only work during a merge
- Be especially careful not to accidentally drop replayed-commit changes during a rebase just because Git labels the sides as ours/theirs
- Use commit history and commit timestamps to understand which side changed what after the merge base
- If a block changed only on one side after the merge base and was not meaningfully changed on the other side, preserve that side exactly unless the code was moved or replaced semantically by the other side
- Preserve side-only changes when possible, but do not preserve them mechanically if the other side changed surrounding architecture, data flow, ownership, or APIs in a way that requires adapting or replacing that code
- Prefer semantic correctness over textual preservation
- If both sides changed the same area, merge semantically and explain the choice
- In a rebase, reason in terms of upstream / onto side versus replayed commit, not just Git's ours/theirs labels
- Minimize incidental rewrites, comment churn, and formatting-only drift in conflicted regions
- Keep the resolved result as close as possible to the unchanged side in areas not meaningfully touched by the other side, but fully adapt the code where cross-side architectural, API, ownership, or data-flow changes require it
- When reintroducing side-only helpers or logic after taking a resolution that mostly follows the other side, restore the original text where possible instead of rewriting it
- When code must be adapted or replaced to fit the other side's changes, explain:
    - why exact preservation is not correct
    - what was retained conceptually
    - what had to change structurally

Required analysis:

- Show:
    - operation type (`merge` or `rebase`)
    - `git status --short --branch`
    - conflicted files
    - merge base SHA
    - if merge:
        - HEAD SHA
        - `MERGE_HEAD` SHA
    - if rebase:
        - HEAD SHA
        - replayed commit SHA (`REBASE_HEAD` if available)
        - onto / upstream SHA
        - original branch name if available
- For each conflicted file, summarize:
    - what changed on the destination side since merge base
    - what changed on the incoming/replayed side since merge base
    - what must be preserved from each side
    - confidence in resolution

Resolution plan requirements:

- For each conflicted file, state the proposed resolution: which hunks to keep from each side, any manual merging needed, and why
- Preserve the latest intentional side-only changes by checking merge base and commit history
- If there is uncertainty, call it out clearly instead of guessing
- Flag any files where side-only changes risk being accidentally reverted or dropped

Final report format:

1. Operation summary (merge or rebase, branches/commits, merge base, relevant HEADs)
2. Conflict-by-conflict resolution plan with rationale
3. Additional non-conflict changes that will be needed
4. Validation steps to run after resolution
5. Areas of uncertainty or risk that need human review
