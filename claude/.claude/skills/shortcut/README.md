# Shortcut Integration Skill

Integrates with Shortcut's project management platform via Python scripts using the Shortcut API v3. Supports creating, updating, searching, and managing stories, epics, iterations, teams, workflows, objectives, and documents.

## Setup

Set the `SHORTCUT_API_TOKEN` environment variable with your Shortcut API token:

```bash
export SHORTCUT_API_TOKEN="your-token-here"
```

Get your API token from: https://app.shortcut.com/settings/account/api-tokens

Optionally, set `SHORTCUT_CURRENT_USER_ID` to cache the current user's ID and reduce API calls.

## CLI Tools

- **`shortcut-api-read`** - Read-only operations (auto-approved)
- **`shortcut-api-write`** - Write operations (require approval)

Pattern:
```bash
shortcut-api-{read|write} <entity> <operation> [args...]
```

## Response Format

All operations return JSON:

**Story:**
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

Errors return JSON to stderr with non-zero exit code:

```json
{
  "error": "API request failed: 404 Client Error\nDetails: {...}"
}
```

## Dependencies

- Python 3.6+ (standard library only)

## Python Usage

Scripts can be imported as modules:

```python
from scripts.stories import get_story, search_stories, create_story
from scripts.users import get_current_user

user = get_current_user()
stories = search_stories(query="login", story_type="bug", limit=10)
story = create_story(name="Fix bug", story_type="bug", owner_ids=[user["id"]])
```
