I am in the middle of a git merge and want you to handle it carefully.

Tasks:

1. Analyze the merge in progress
2. List and summarize all merge conflicts
3. Identify any additional non-conflict changes needed to complete the merge cleanly
4. Produce a detailed resolution plan for each conflict (do NOT edit any files)

Do edit files, or run `git add`/`git merge --continue`. Output a plan that can be executed to resolve the merge.

Important merge-resolution rules:

- Do not blindly prefer ours or theirs
- First identify:
    - current branch HEAD
    - incoming branch commit (`MERGE_HEAD`)
    - merge base
- For each conflicted file, compare:
    - merge base version
    - current branch version
    - incoming branch version
- Preserve the newest intentional current-branch changes when the incoming branch did not actually change that code
- Be especially careful not to accidentally revert current-branch-only work just because the surrounding file conflicted
- Use commit history and commit timestamps to understand which side changed what after the merge base
- If a block was changed only on the current branch after the merge base and not meaningfully changed on the incoming branch, preserve the current-branch version exactly
- Preserve current-branch-only changes when possible, but do not preserve them mechanically if the incoming branch changed surrounding architecture, data flow, ownership, or APIs in a way that requires adapting or replacing that code
- Prefer semantic correctness over textual preservation
- If both sides changed the same area, merge semantically and explain the choice
- Minimize incidental rewrites, comment churn, and formatting-only drift in conflicted regions
- Keep the resolved result as close as possible to the pre-merge current-branch code in areas not changed by the incoming branch, but fully adapt the code where incoming-branch changes require architectural, API, ownership, or data-flow integration
- When reintroducing current-branch-only helpers or logic after taking an incoming-heavy resolution, restore the original current-branch text where possible instead of rewriting it
- When current-branch code must be adapted or replaced to fit incoming-branch changes, explain:
    - why preservation is not correct
    - what was retained conceptually
    - what had to change structurally

Required analysis:

- Show:
    - `git status --short --branch`
    - conflicted files
    - merge base SHA
    - HEAD SHA
    - MERGE_HEAD SHA
- For each conflicted file, summarize:
    - what changed on the current branch since merge base
    - what changed on the incoming branch since merge base
    - what must be preserved from each side
    - confidence in resolution

Resolution plan requirements:

- For each conflicted file, state the proposed resolution: which hunks to keep from each side, any manual merging needed, and why
- Preserve latest current-branch changes by checking merge base and commit history
- If there is uncertainty, call it out clearly instead of guessing
- Flag any files where current-branch-only changes risk being accidentally reverted

Final report format:

1. Merge summary (branches, merge base, HEADs)
2. Conflict-by-conflict resolution plan with rationale
3. Additional non-conflict changes that will be needed
4. Validation steps to run after resolution
5. Areas of uncertainty or risk that need human review
