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

## Available Operations

### Stories

Stories are the standard unit of work in Shortcut. Use the `stories.py` script for all story operations.

**Get a story:**
```bash
python3 scripts/stories.py get <story-id>
```

**Search stories:**
```bash
python3 scripts/stories.py search \
  --query "search text" \
  --owner-ids <user-id> \
  --team-id <team-id> \
  --iteration-id <iteration-id> \
  --epic-id <epic-id> \
  --workflow-state-id <state-id> \
  --story-type feature|bug|chore \
  --limit 25
```

**Create a story:**
```bash
python3 scripts/stories.py create "Story title" \
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
python3 scripts/stories.py update <story-id> \
  --name "New title" \
  --description "New description" \
  --type bug \
  --workflow-state-id <state-id> \
  --iteration-id <iteration-id> \
  --archived
```

**Delete a story:**
```bash
python3 scripts/stories.py delete <story-id>
```

**Get branch name for a story:**
```bash
python3 scripts/stories.py branch-name <story-id>
```
Returns a formatted git branch name like `sc-123/feature-description`

**Add a comment to a story:**
```bash
python3 scripts/stories.py comment <story-id> "Comment text"
```

### Epics

Epics are collections of related stories representing larger features or initiatives.

**Get an epic:**
```bash
python3 scripts/epics.py get <epic-id>
```

**List all epics:**
```bash
python3 scripts/epics.py list
```

**Search epics:**
```bash
python3 scripts/epics.py search --query "search text" --state "in progress"
```

**Create an epic:**
```bash
python3 scripts/epics.py create "Epic name" \
  --description "Epic description" \
  --state "to do" \
  --owner-ids <user-id>
```

**Update an epic:**
```bash
python3 scripts/epics.py update <epic-id> \
  --name "New name" \
  --state "done" \
  --archived
```

**Delete an epic:**
```bash
python3 scripts/epics.py delete <epic-id>
```

### Iterations

Iterations (sprints) are time-boxed periods of development.

**Get current active iteration:**
```bash
python3 scripts/iterations.py list --status started
```

**Filter by status (started, unstarted, done):**
```bash
python3 scripts/iterations.py list --status done
```

**Get a specific iteration:**
```bash
python3 scripts/iterations.py get <iteration-id>
```

**List all iterations (add --with-stats for story counts):**
```bash
python3 scripts/iterations.py list
```

**Create an iteration:**
```bash
python3 scripts/iterations.py create "Sprint 1" 2025-01-01 2025-01-14 \
  --description "Sprint description" \
  --team-ids <team-id>
```

**Update an iteration:**
```bash
python3 scripts/iterations.py update <iteration-id> \
  --name "Sprint 2" \
  --start-date 2025-01-15 \
  --end-date 2025-01-28
```

**Delete an iteration:**
```bash
python3 scripts/iterations.py delete <iteration-id>
```

### Teams

Teams represent groups of people working together.

**Get a team:**
```bash
python3 scripts/teams.py get <team-id>
```

**List all teams:**
```bash
python3 scripts/teams.py list
```

### Workflows

Workflows define the states that stories move through.

**Get a workflow:**
```bash
python3 scripts/workflows.py get <workflow-id>
```

**List all workflows:**
```bash
python3 scripts/workflows.py list
```

### Users/Members

Manage workspace members and get current user information.

**Get a member:**
```bash
python3 scripts/users.py get <member-id>
```

**List all members:**
```bash
python3 scripts/users.py list
```

**Get current user:**
```bash
python3 scripts/users.py current
```

**Get current user's teams:**
```bash
python3 scripts/users.py current-teams
```

### Objectives

Objectives represent high-level goals.

**Get an objective:**
```bash
python3 scripts/objectives.py get <objective-id>
```

**List all objectives:**
```bash
python3 scripts/objectives.py list
```

**Create an objective:**
```bash
python3 scripts/objectives.py create "Objective name" \
  --description "Objective description"
```

**Update an objective:**
```bash
python3 scripts/objectives.py update <objective-id> \
  --name "New name" \
  --state "done"
```

**Delete an objective:**
```bash
python3 scripts/objectives.py delete <objective-id>
```

### Documents

Create documentation in Shortcut.

**Create a document:**
```bash
python3 scripts/documents.py create "Doc title" "<h1>HTML Content</h1>"
```

## Common Workflows

### Get Stories in Current Iteration

```bash
# Get current iteration
python3 scripts/iterations.py list --status started
# Then search stories with the iteration ID and your user ID
python3 scripts/stories.py search --iteration-id <id> --owner-ids <user-id>
```

### Creating a Story with Full Context

When creating a story, gather the necessary IDs first:

1. Get current user: `python3 scripts/users.py current`
2. List teams: `python3 scripts/teams.py list`
3. Get current iteration: `python3 scripts/iterations.py list --status started`
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

python3 scripts/stories.py create "add v2 rate limiting" \
  --type feature \
  --team-id <infra-team-id> \
  --owner-ids <user-id> \
  --iteration-id <current-iteration-id>

# Then get the branch name
python3 scripts/stories.py branch-name <new-story-id>
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
