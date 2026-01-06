# Shortcut Integration Skill

Integrates with Shortcut's project management platform via TypeScript/Bun scripts using the Shortcut API v3. Supports creating, updating, searching, and managing stories, epics, iterations, teams, workflows, objectives, and documents.

## Setup

Set the `SHORTCUT_API_TOKEN` environment variable with your Shortcut API token:

```bash
export SHORTCUT_API_TOKEN="your-token-here"
```

Get your API token from: https://app.shortcut.com/settings/account/api-tokens

Optionally, set `SHORTCUT_CURRENT_USER_ID` to cache the current user's ID and reduce API calls.

## Installation

```bash
cd claude/.claude/skills/shortcut
bun install
```

## CLI Tools

- **`shortcut-api-read`** - Read-only operations (auto-approved)
- **`shortcut-api-write`** - Write operations (require approval)

Pattern:

```bash
shortcut-api-{read|write} <entity> <operation> [args...]
```

### Examples

```bash
# Get a story
./shortcut-api-read stories get 123

# Search stories in current iteration
./shortcut-api-read stories search --iteration-id 456 --owner-ids user-uuid

# List current iteration
./shortcut-api-read iterations list --status started

# Create a story
./shortcut-api-write stories create "Fix login bug" --type bug --team-id team-uuid

# Create a story and checkout a branch
./shortcut-api-write stories create-and-checkout "Fix login bug" --type bug --team-id team-uuid

# Get branch name for a story
./shortcut-api-read stories branch-name 123
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
  "labels": [{ "id": 1, "name": "backend" }],
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

- Bun 1.0+
- commander (CLI argument parsing)

## TypeScript Usage

Scripts can be imported as modules:

```typescript
import {
  getStory,
  searchStories,
  createStory,
} from "./src/entities/stories.js";
import { getCurrentUser } from "./src/client.js";

const user = await getCurrentUser();
const stories = await searchStories({
  query: "login",
  storyType: "bug",
  limit: 10,
});
const story = await createStory({
  name: "Fix bug",
  storyType: "bug",
  ownerIds: [user.id],
});
```
