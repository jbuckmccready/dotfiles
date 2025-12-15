---
description: Open a Github Pull Request using the project template and Shortcut story title
subtask: false
---

Open a new pull request for the current branch.

1. **Determine PR Title, Draft Flag, and Base Branch**:
   - If `$ARGUMENTS` is non-empty:
     - Detect a standalone `--draft` token (for example, `/open-pr --draft My title` or `/open-pr My title --draft`).
     - If present, record that the PR should be created as a draft and remove the `--draft` token from the would-be title string.
     - Detect a standalone `--base` token.
     - If present, determine the base branch by finding the upstream tracking branch:
       - Run `git rev-parse --abbrev-ref @{upstream}` to get the upstream branch (e.g., `origin/xyz`).
       - Extract the branch name (e.g., `xyz`) by stripping the remote prefix, treat this as `$BASE_BRANCH`.
       - If no upstream is configured, abort with a clear message such as "Cannot determine base branch: no upstream configured. Set with `git branch --set-upstream-to=origin/<branch>`".
       - Remove the `--base` token from the would-be title string.
     - If `--base` is not present, default to the repository's default branch (typically `main`).
     - Treat the remaining string (trimmed) as the PR title. If the remaining string is empty, behave as if `$ARGUMENTS` were empty.
   - If `$ARGUMENTS` is empty or only contained flags (`--draft` and/or `--base`), try to fetch the title from Shortcut:
     - Get the current git branch name.
     - Extract the Shortcut Story ID from the branch name (looking for `sc-<id>` or `ch<id>` pattern, or just the number).
     - If found, run `shortcut-api-read stories get <id>` to get the story title. Use this exact title.
     - If no story is found, generate a concise title based on the git changes:
       - Summarize the changes in <= 70 characters.
       - Prefer imperative mood (e.g. "Add…", "Fix…", "Refactor…").

2. **Determine PR Template**:
   - Check for a standard pull request template in the current repository in this order:
     1. `.github/pull_request_template.md`
     2. `docs/pull_request_template.md`
     3. `pull_request_template.md`
   - If multiple templates exist, use only the first one found in the above order.
   - If one of these files exists, read it to use as the template.
   - If NONE exist, use the following fallback template:

   ```markdown
   ## Summary

   What does this PR do and why?

   ## Implementation

   Key decisions and related changes.

   ## Risks

   Side effects, shortcuts, or future improvements needed.

   ## Testing

   How was this tested?
   ```

3. **Prepare PR Body**:
   - Analyze changes using `git diff $BASE_BRANCH...HEAD` and `git log $BASE_BRANCH...HEAD` (where `$BASE_BRANCH` is the determined base branch).
   - Fill out the chosen template sections based on your analysis (explore/analyze the code base if changes unclear).
   - Remove or replace any template placeholders (e.g., `<!-- description -->`) with actual content.
   - Do NOT include a Shortcut story link in the PR body; it will be added automatically as a comment.

4. **Validation & Guardrails**:
   - Before creating a PR, check for meaningful changes relative to the base branch:
     - If `git diff $BASE_BRANCH...HEAD` shows no changes, abort with a clear message.
   - Before creating a new PR, check if one already exists for the current branch by running `gh pr view --json url`:
     - If a PR exists, print or return its URL instead of creating a duplicate.
   - Handle special states explicitly:
     - If on a detached HEAD, abort with a clear message such as "Cannot open PR: not on a branch.".
     - If `gh` is not authenticated or fails due to auth, surface the error message and do not attempt to work around it.

5. **Create PR**:
   - Run `gh pr create` using a heredoc for the body to safely support multiline templates, for example:

     ```bash
     # If `$ARGUMENTS` contained `--draft`, include the flag
     if [ "$IS_DRAFT" = "1" ]; then
       DRAFT_FLAG="--draft"
     else
       DRAFT_FLAG=""
     fi

     # BASE_BRANCH determined in step 1 (defaults to repo default, or upstream if --base was passed)
     gh pr create $DRAFT_FLAG --push --base "$BASE_BRANCH" --title "$TITLE" --body "$(cat <<'EOF'
     ...template with filled sections...
     EOF
     )"
     ```

   - Output the created PR URL to the user upon success.
