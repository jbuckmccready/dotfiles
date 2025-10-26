#!/usr/bin/env python3
"""
Shortcut Stories - Operations for managing stories.

This module provides functions for creating, updating, searching, and retrieving stories.
"""

import sys
import json
import argparse
from typing import Dict, List, Optional
from shortcut_client import ShortcutClient, format_story, get_current_user


def get_story(story_id: int) -> Dict:
    """
    Get a single story by ID.

    Args:
        story_id: The story ID

    Returns:
        Formatted story data
    """
    client = ShortcutClient()
    story = client.get(f"stories/{story_id}")
    return format_story(story)


def search_stories(
    query: Optional[str] = None,
    owner_ids: Optional[List[str]] = None,
    team_id: Optional[str] = None,
    iteration_id: Optional[int] = None,
    epic_id: Optional[int] = None,
    workflow_state_id: Optional[int] = None,
    story_type: Optional[str] = None,
    limit: int = 25
) -> List[Dict]:
    """
    Search for stories with various filters.

    Args:
        query: Text search query
        owner_ids: Filter by owner IDs
        team_id: Filter by team ID
        iteration_id: Filter by iteration ID
        epic_id: Filter by epic ID
        workflow_state_id: Filter by workflow state ID
        story_type: Filter by story type (feature, bug, chore)
        limit: Maximum number of results (default 25, max 1000)

    Returns:
        List of formatted stories
    """
    client = ShortcutClient()

    # If iteration_id is specified, use the dedicated /iterations/{id}/stories endpoint
    # The search API doesn't reliably filter by iteration_id
    if iteration_id:
        stories = client.get(f"iterations/{iteration_id}/stories")

        # Apply client-side filters for additional criteria
        if team_id:
            stories = [s for s in stories if s.get("group_id") == team_id]
        if owner_ids:
            stories = [s for s in stories if any(oid in s.get("owner_ids", []) for oid in owner_ids)]
        if epic_id:
            stories = [s for s in stories if s.get("epic_id") == epic_id]
        if workflow_state_id:
            stories = [s for s in stories if s.get("workflow_state_id") == workflow_state_id]
        if story_type:
            stories = [s for s in stories if s.get("story_type") == story_type]
        if query:
            # Simple text search in name and description
            query_lower = query.lower()
            stories = [s for s in stories
                      if query_lower in s.get("name", "").lower()
                      or query_lower in s.get("description", "").lower()]

        # Apply limit
        stories = stories[:limit]

        return [format_story(story) for story in stories]

    # Otherwise, use search API for non-iteration queries
    # Build search query
    search_params = {"page_size": min(limit, 1000)}

    if query:
        search_params["query"] = query

    # Build filters
    filters = {}
    if owner_ids:
        filters["owner_ids"] = owner_ids
    if team_id:
        filters["group_id"] = team_id
    if epic_id:
        filters["epic_id"] = epic_id
    if workflow_state_id:
        filters["workflow_state_id"] = workflow_state_id
    if story_type:
        filters["story_type"] = story_type

    if filters:
        search_params["query"] = search_params.get("query", "") + " " + " ".join(
            f"{k}:{v}" for k, v in filters.items()
        )

    # Execute search
    result = client.get("search/stories", params=search_params)
    stories = result.get("data", [])

    return [format_story(story) for story in stories]


def create_story(
    name: str,
    story_type: str = "feature",
    description: Optional[str] = None,
    team_id: Optional[str] = None,
    owner_ids: Optional[List[str]] = None,
    requester_id: Optional[str] = None,
    iteration_id: Optional[int] = None,
    epic_id: Optional[int] = None,
    workflow_state_id: Optional[int] = None,
    estimate: Optional[int] = None,
    labels: Optional[List[Dict]] = None
) -> Dict:
    """
    Create a new story.

    Args:
        name: Story title
        story_type: Type of story (feature, bug, chore)
        description: Story description
        team_id: Team ID
        owner_ids: List of owner IDs
        requester_id: Requester ID (defaults to current user)
        iteration_id: Iteration ID
        epic_id: Epic ID
        workflow_state_id: Initial workflow state ID
        estimate: Story point estimate
        labels: List of label objects with 'name' field

    Returns:
        Formatted created story
    """
    client = ShortcutClient()

    # Default requester to current user if not specified
    if not requester_id:
        current_user = get_current_user(client)
        requester_id = current_user["id"]

    # Build story data
    story_data = {
        "name": name,
        "story_type": story_type,
        "requested_by_id": requester_id
    }

    if description:
        story_data["description"] = description
    if team_id:
        story_data["group_id"] = team_id
    if owner_ids:
        story_data["owner_ids"] = owner_ids
    if iteration_id:
        story_data["iteration_id"] = iteration_id
    if epic_id:
        story_data["epic_id"] = epic_id
    if workflow_state_id:
        story_data["workflow_state_id"] = workflow_state_id
    if estimate is not None:
        story_data["estimate"] = estimate
    if labels:
        story_data["labels"] = labels

    story = client.post("stories", story_data)
    return format_story(story)


def update_story(
    story_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    story_type: Optional[str] = None,
    team_id: Optional[str] = None,
    owner_ids: Optional[List[str]] = None,
    iteration_id: Optional[int] = None,
    epic_id: Optional[int] = None,
    workflow_state_id: Optional[int] = None,
    estimate: Optional[int] = None,
    labels: Optional[List[Dict]] = None,
    archived: Optional[bool] = None
) -> Dict:
    """
    Update an existing story.

    Args:
        story_id: The story ID to update
        name: Updated story title
        description: Updated description
        story_type: Updated type (feature, bug, chore)
        team_id: Updated team ID
        owner_ids: Updated list of owner IDs
        iteration_id: Updated iteration ID
        epic_id: Updated epic ID
        workflow_state_id: Updated workflow state ID
        estimate: Updated story point estimate
        labels: Updated list of label objects
        archived: Archive/unarchive the story

    Returns:
        Formatted updated story
    """
    client = ShortcutClient()

    # Build update data with only provided fields
    update_data = {}
    if name is not None:
        update_data["name"] = name
    if description is not None:
        update_data["description"] = description
    if story_type is not None:
        update_data["story_type"] = story_type
    if team_id is not None:
        update_data["group_id"] = team_id
    if owner_ids is not None:
        update_data["owner_ids"] = owner_ids
    if iteration_id is not None:
        update_data["iteration_id"] = iteration_id
    if epic_id is not None:
        update_data["epic_id"] = epic_id
    if workflow_state_id is not None:
        update_data["workflow_state_id"] = workflow_state_id
    if estimate is not None:
        update_data["estimate"] = estimate
    if labels is not None:
        update_data["labels"] = labels
    if archived is not None:
        update_data["archived"] = archived

    story = client.put(f"stories/{story_id}", update_data)
    return format_story(story)


def delete_story(story_id: int) -> Dict:
    """
    Delete a story.

    Args:
        story_id: The story ID to delete

    Returns:
        Success message
    """
    client = ShortcutClient()
    client.delete(f"stories/{story_id}")
    return {"success": True, "message": f"Story {story_id} deleted"}


def get_story_branch_name(story_id: int) -> Dict:
    """
    Get the recommended branch name for a story based on workspace settings.

    Args:
        story_id: The story ID

    Returns:
        Dict with branch_name field
    """
    story = get_story(story_id)

    # Generate branch name based on story ID and name
    # Format: story-{id}-{sanitized-name}
    sanitized_name = story["name"].lower()
    # Replace spaces and special chars with hyphens
    import re
    sanitized_name = re.sub(r'[^a-z0-9]+', '-', sanitized_name)
    sanitized_name = sanitized_name.strip('-')
    # Limit length
    sanitized_name = sanitized_name[:50]

    branch_name = f"sc-{story_id}/{sanitized_name}"

    return {
        "story_id": story_id,
        "branch_name": branch_name,
        "story_name": story["name"]
    }


def create_story_comment(story_id: int, text: str) -> Dict:
    """
    Create a comment on a story.

    Args:
        story_id: The story ID
        text: Comment text

    Returns:
        Comment data
    """
    client = ShortcutClient()
    comment_data = {"text": text}
    comment = client.post(f"stories/{story_id}/comments", comment_data)

    return {
        "id": comment["id"],
        "text": comment["text"],
        "author_id": comment["author_id"],
        "created_at": comment["created_at"],
        "updated_at": comment["updated_at"]
    }


def main():
    """CLI interface for story operations."""
    parser = argparse.ArgumentParser(description="Shortcut Stories Operations")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # Get story
    get_parser = subparsers.add_parser("get", help="Get a story by ID")
    get_parser.add_argument("story_id", type=int, help="Story ID")

    # Search stories
    search_parser = subparsers.add_parser("search", help="Search stories")
    search_parser.add_argument("--query", help="Search query")
    search_parser.add_argument("--owner-ids", nargs="+", help="Owner IDs")
    search_parser.add_argument("--team-id", help="Team ID")
    search_parser.add_argument("--iteration-id", type=int, help="Iteration ID")
    search_parser.add_argument("--epic-id", type=int, help="Epic ID")
    search_parser.add_argument("--workflow-state-id", type=int, help="Workflow state ID")
    search_parser.add_argument("--story-type", choices=["feature", "bug", "chore"], help="Story type")
    search_parser.add_argument("--limit", type=int, default=25, help="Result limit")

    # Create story
    create_parser = subparsers.add_parser("create", help="Create a new story")
    create_parser.add_argument("name", help="Story title")
    create_parser.add_argument("--type", dest="story_type", default="feature", choices=["feature", "bug", "chore"])
    create_parser.add_argument("--description", help="Story description")
    create_parser.add_argument("--team-id", help="Team ID")
    create_parser.add_argument("--owner-ids", nargs="+", help="Owner IDs")
    create_parser.add_argument("--iteration-id", type=int, help="Iteration ID")
    create_parser.add_argument("--epic-id", type=int, help="Epic ID")
    create_parser.add_argument("--estimate", type=int, help="Story point estimate")

    # Update story
    update_parser = subparsers.add_parser("update", help="Update a story")
    update_parser.add_argument("story_id", type=int, help="Story ID")
    update_parser.add_argument("--name", help="Updated title")
    update_parser.add_argument("--description", help="Updated description")
    update_parser.add_argument("--type", dest="story_type", choices=["feature", "bug", "chore"])
    update_parser.add_argument("--team-id", help="Team ID")
    update_parser.add_argument("--owner-ids", nargs="+", help="Owner IDs")
    update_parser.add_argument("--iteration-id", type=int, help="Iteration ID")
    update_parser.add_argument("--workflow-state-id", type=int, help="Workflow state ID")
    update_parser.add_argument("--archived", action="store_true", help="Archive the story")

    # Delete story
    delete_parser = subparsers.add_parser("delete", help="Delete a story")
    delete_parser.add_argument("story_id", type=int, help="Story ID")

    # Get branch name
    branch_parser = subparsers.add_parser("branch-name", help="Get recommended branch name")
    branch_parser.add_argument("story_id", type=int, help="Story ID")

    # Create comment
    comment_parser = subparsers.add_parser("comment", help="Add a comment to a story")
    comment_parser.add_argument("story_id", type=int, help="Story ID")
    comment_parser.add_argument("text", help="Comment text")

    args = parser.parse_args()

    try:
        if args.command == "get":
            result = get_story(args.story_id)
        elif args.command == "search":
            result = search_stories(
                query=args.query,
                owner_ids=args.owner_ids,
                team_id=args.team_id,
                iteration_id=args.iteration_id,
                epic_id=args.epic_id,
                workflow_state_id=args.workflow_state_id,
                story_type=args.story_type,
                limit=args.limit
            )
        elif args.command == "create":
            result = create_story(
                name=args.name,
                story_type=args.story_type,
                description=args.description,
                team_id=args.team_id,
                owner_ids=args.owner_ids,
                iteration_id=args.iteration_id,
                epic_id=args.epic_id,
                estimate=args.estimate
            )
        elif args.command == "update":
            result = update_story(
                story_id=args.story_id,
                name=args.name,
                description=args.description,
                story_type=args.story_type,
                team_id=args.team_id,
                owner_ids=args.owner_ids,
                iteration_id=args.iteration_id,
                workflow_state_id=args.workflow_state_id,
                archived=args.archived if hasattr(args, 'archived') else None
            )
        elif args.command == "delete":
            result = delete_story(args.story_id)
        elif args.command == "branch-name":
            result = get_story_branch_name(args.story_id)
        elif args.command == "comment":
            result = create_story_comment(args.story_id, args.text)
        else:
            parser.print_help()
            sys.exit(1)

        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
