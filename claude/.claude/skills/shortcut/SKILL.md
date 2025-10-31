---
name: shortcut
description: Comprehensive Shortcut integration for managing stories, epics, iterations, teams, workflows, objectives, and documents. Use when interacting with Shortcut's project management platform to create, update, search, or retrieve project data. Supports the complete Shortcut API including story management, sprint planning, team organization, and workflow tracking.
---

# Shortcut Integration Skill

Provides complete integration with Shortcut's project management platform through Python scripts that interact with the Shortcut API v3. This skill enables creating, updating, searching, and managing all major Shortcut entities.

## Setup

Set the `SHORTCUT_API_TOKEN` environment variable with your Shortcut API token:

```bash
export SHORTCUT_API_TOKEN="your-token-here"
```

Get your API token from: https://app.shortcut.com/settings/account/api-tokens

Optionally, set `SHORTCUT_CURRENT_USER_ID` to cache the current user's ID and reduce API calls.

## CLI Tools

This skill provides two CLI tools:

- **`claude-shortcut-read`** - Read-only operations (auto-approved via permissions)
- **`claude-shortcut-write`** - Write operations (require explicit approval)

Both tools follow the same pattern:
```bash
claude-shortcut-{read|write} <entity> <operation> [args...]
```

## Available Operations

### Stories

Stories are the standard unit of work in Shortcut.

**Get a story:**
```bash
claude-shortcut-read stories get <story-id>
```

**Search stories:**
```bash
claude-shortcut-read stories search \
  --query "search text" \
  --owner-ids <user-id> \
  --team-id <team-id> \
  --iteration-id <iteration-id> \
  --epic-id <epic-id> \
  --workflow-state-id <state-id> \
  --story-type feature|bug|chore \
  --limit 25
```

**Get branch name for a story:**
```bash
claude-shortcut-read stories branch-name <story-id>
```
Returns a formatted git branch name like `sc-123/feature-description`

**Create a story:**
```bash
claude-shortcut-write stories create "Story title" \
  --type feature|bug|chore \
  --description "Story description" \
  --team-id <team-id> \
  --owner-ids <user-id> <user-id> \
  --iteration-id <iteration-id> \
  --epic-id <epic-id> \
  --estimate 3
```

**Update a story:**
```bash
claude-shortcut-write stories update <story-id> \
  --name "New title" \
  --description "New description" \
  --type bug \
  --workflow-state-id <state-id> \
  --iteration-id <iteration-id> \
  --archived
```

**Delete a story:**
```bash
claude-shortcut-write stories delete <story-id>
```

**Add a comment to a story:**
```bash
claude-shortcut-write stories comment <story-id> "Comment text"
```

### Epics

Epics are collections of related stories representing larger features or initiatives.

**Get an epic:**
```bash
claude-shortcut-read epics get <epic-id>
```

**List all epics:**
```bash
claude-shortcut-read epics list
```

**Search epics:**
```bash
claude-shortcut-read epics search --query "search text" --state "in progress"
```

**Create an epic:**
```bash
claude-shortcut-write epics create "Epic name" \
  --description "Epic description" \
  --state "to do" \
  --owner-ids <user-id>
```

**Update an epic:**
```bash
claude-shortcut-write epics update <epic-id> \
  --name "New name" \
  --state "done" \
  --archived
```

**Delete an epic:**
```bash
claude-shortcut-write epics delete <epic-id>
```

### Iterations

Iterations (sprints) are time-boxed periods of development.

**Get current active iteration:**
```bash
claude-shortcut-read iterations list --status started
```

**Filter by status (started, unstarted, done):**
```bash
claude-shortcut-read iterations list --status done
```

**Get a specific iteration:**
```bash
claude-shortcut-read iterations get <iteration-id>
```

**List all iterations (add --with-stats for story counts):**
```bash
claude-shortcut-read iterations list
```

**Create an iteration:**
```bash
claude-shortcut-write iterations create "Sprint 1" 2025-01-01 2025-01-14 \
  --description "Sprint description" \
  --team-ids <team-id>
```

**Update an iteration:**
```bash
claude-shortcut-write iterations update <iteration-id> \
  --name "Sprint 2" \
  --start-date 2025-01-15 \
  --end-date 2025-01-28
```

**Delete an iteration:**
```bash
claude-shortcut-write iterations delete <iteration-id>
```

### Teams

Teams represent groups of people working together.

**Get a team:**
```bash
claude-shortcut-read teams get <team-id>
```

**List all teams:**
```bash
claude-shortcut-read teams list
```

### Workflows

Workflows define the states that stories move through.

**Get a workflow:**
```bash
claude-shortcut-read workflows get <workflow-id>
```

**List all workflows:**
```bash
claude-shortcut-read workflows list
```

### Users/Members

Manage workspace members and get current user information.

**Get a member:**
```bash
claude-shortcut-read users get <member-id>
```

**List all members:**
```bash
claude-shortcut-read users list
```

**Get current user:**
```bash
claude-shortcut-read users current
```

**Get current user's teams:**
```bash
claude-shortcut-read users current-teams
```

### Objectives

Objectives represent high-level goals.

**Get an objective:**
```bash
claude-shortcut-read objectives get <objective-id>
```

**List all objectives:**
```bash
claude-shortcut-read objectives list
```

**Create an objective:**
```bash
claude-shortcut-write objectives create "Objective name" \
  --description "Objective description"
```

**Update an objective:**
```bash
claude-shortcut-write objectives update <objective-id> \
  --name "New name" \
  --state "done"
```

**Delete an objective:**
```bash
claude-shortcut-write objectives delete <objective-id>
```

### Documents

Create documentation in Shortcut.

**Create a document:**
```bash
claude-shortcut-write documents create "Doc title" "<h1>HTML Content</h1>"
```

## Common Workflows

### Get Stories in Current Iteration

```bash
# Get current iteration
claude-shortcut-read iterations list --status started
# Then search stories with the iteration ID and your user ID
claude-shortcut-read stories search --iteration-id <id> --owner-ids <user-id>
```

### Creating a Story with Full Context

When creating a story, gather the necessary IDs first:

1. Get current user: `claude-shortcut-read users current`
2. List teams: `claude-shortcut-read teams list`
3. Get current iteration: `claude-shortcut-read iterations list --status started`
4. Create the story with gathered information

### Story Creation from Title

For the common pattern in the `story-and-branch.md` example:

```bash
# Parse title like "feat(edge-gateway): add v2 rate limiting"
# Extract type (feat = feature, bug = bug, chore = chore)
# Get team ID for "Infra Team"
# Get current user or specified owner
# Get current started iteration
# Create story and get branch name

claude-shortcut-write stories create "add v2 rate limiting" \
  --type feature \
  --team-id <infra-team-id> \
  --owner-ids <user-id> \
  --iteration-id <current-iteration-id>

# Then get the branch name
claude-shortcut-read stories branch-name <new-story-id>
```

## Python API Usage

All scripts can also be imported and used as Python modules:

```python
from scripts.stories import create_story, get_story, search_stories
from scripts.shortcut_client import get_current_user

# Get current user
user = get_current_user()

# Create a story
story = create_story(
    name="Fix login bug",
    story_type="bug",
    team_id="abc123",
    owner_ids=[user["id"]],
    iteration_id=456
)

# Search for stories
stories = search_stories(
    query="login",
    story_type="bug",
    limit=10
)
```

## Response Format

All operations return JSON with only essential fields to reduce verbosity:

**Story response:**
```json
{
  "id": 123,
  "name": "Story title",
  "description": "Description",
  "story_type": "feature",
  "workflow_state_id": 500000001,
  "app_url": "https://app.shortcut.com/org/story/123",
  "created_at": "2025-01-01T12:00:00Z",
  "updated_at": "2025-01-02T12:00:00Z",
  "completed": false,
  "owner_ids": ["user-uuid"],
  "requester_id": "user-uuid",
  "iteration_id": 456,
  "epic_id": 789,
  "estimate": 3,
  "labels": [{"id": 1, "name": "backend"}],
  "team_id": "team-uuid"
}
```

## Error Handling

All scripts return errors as JSON to stderr with a non-zero exit code:

```json
{
  "error": "API request failed: 404 Client Error\nDetails: {...}"
}
```

## Dependencies

- Python 3.6+
- No external dependencies (uses Python standard library only)

The `shortcut_client.py` module provides shared functionality for API authentication and response formatting.
