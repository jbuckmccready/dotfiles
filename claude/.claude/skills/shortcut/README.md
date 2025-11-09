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

- **`shortcut-api-read`** - Read-only operations (auto-approved via permissions)
- **`shortcut-api-write`** - Write operations (require explicit approval)

Both tools follow the same pattern:
```bash
shortcut-api-{read|write} <entity> <operation> [args...]
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
