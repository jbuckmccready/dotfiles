"""
Shortcut API Client - Core utility for interacting with the Shortcut API.

This module provides a client for making authenticated requests to the Shortcut API
and helper functions for formatting responses.
"""

import os
import json
import urllib.request
import urllib.parse
import urllib.error
from typing import Dict, Optional, Any


class ShortcutClient:
    """Client for interacting with the Shortcut API."""

    BASE_URL = "https://api.app.shortcut.com/api/v3"

    def __init__(self, api_token: Optional[str] = None):
        """
        Initialize the Shortcut client.

        Args:
            api_token: Shortcut API token. If not provided, reads from SHORTCUT_API_TOKEN env var.
        """
        self.api_token = api_token or os.getenv("SHORTCUT_API_TOKEN")
        if not self.api_token:
            raise ValueError("SHORTCUT_API_TOKEN environment variable must be set")

        self.headers = {
            "Content-Type": "application/json",
            "Shortcut-Token": self.api_token,
        }

    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None,
    ) -> Any:
        """
        Make an HTTP request to the Shortcut API.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint path
            data: Request body data
            params: Query parameters

        Returns:
            Response data as dict or list
        """
        url = f"{self.BASE_URL}/{endpoint}"

        # Add query parameters to URL if provided
        if params:
            query_string = urllib.parse.urlencode(params)
            url = f"{url}?{query_string}"

        # Prepare request body
        body = None
        if data is not None:
            body = json.dumps(data).encode("utf-8")

        # Create request
        req = urllib.request.Request(
            url, data=body, headers=self.headers, method=method
        )

        try:
            with urllib.request.urlopen(req) as response:
                status_code = response.getcode()

                # Return empty dict for 204 No Content responses
                if status_code == 204:
                    return {}

                response_data = response.read().decode("utf-8")
                return json.loads(response_data)

        except urllib.error.HTTPError as e:
            error_msg = f"API request failed: {e.code} {e.reason}"
            try:
                error_body = e.read().decode("utf-8")
                try:
                    # Try to parse as JSON for structured error details
                    error_detail = json.loads(error_body)
                    error_msg = (
                        f"{error_msg}\nDetails: {json.dumps(error_detail, indent=2)}"
                    )
                except (json.JSONDecodeError, ValueError):
                    # Not JSON, show raw response text
                    error_msg = f"{error_msg}\nResponse: {error_body}"
            except (UnicodeDecodeError, AttributeError):
                # Could not read or decode error body, just use basic message
                pass
            raise Exception(error_msg)
        except urllib.error.URLError as e:
            raise Exception(f"Request failed: {str(e.reason)}")
        except Exception as e:
            raise Exception(f"Request failed: {str(e)}")

    def get(self, endpoint: str, params: Optional[Dict] = None) -> Any:
        """Make a GET request."""
        return self._make_request("GET", endpoint, params=params)

    def post(self, endpoint: str, data: Dict) -> Any:
        """Make a POST request."""
        return self._make_request("POST", endpoint, data=data)

    def put(self, endpoint: str, data: Dict) -> Any:
        """Make a PUT request."""
        return self._make_request("PUT", endpoint, data=data)

    def delete(self, endpoint: str) -> Any:
        """Make a DELETE request."""
        return self._make_request("DELETE", endpoint)


def get_current_user(client: Optional[ShortcutClient] = None) -> Dict:
    """
    Get the current authenticated user.

    Args:
        client: ShortcutClient instance. If not provided, creates a new one.

    Returns:
        Dict with user information (id, name, email)
    """
    if client is None:
        client = ShortcutClient()

    # Check if user ID is cached in environment
    cached_user_id = os.getenv("SHORTCUT_CURRENT_USER_ID")
    if cached_user_id:
        user = client.get(f"members/{cached_user_id}")
        return format_member(user)

    # Fetch current user from API
    user = client.get("member")

    # Cache the user ID for future calls
    os.environ["SHORTCUT_CURRENT_USER_ID"] = user["id"]

    return format_member(user)


def format_member(member: Dict) -> Dict:
    """Format a member object to include only essential fields.

    Handles both formats:
    - /member endpoint: returns data at top level (name, mention_name, etc.)
    - /members/{id} endpoint: returns data nested under 'profile' key
    """
    # Check if this is from /member endpoint (has name at top level)
    if "name" in member:
        return {
            "id": member["id"],
            "name": member.get("name", "Unknown"),
            "email": member.get("email"),
            "mention_name": member.get("mention_name"),
        }

    # Otherwise it's from /members/{id} endpoint (has profile key)
    return {
        "id": member["id"],
        "name": member.get("profile", {}).get("name", "Unknown"),
        "email": member.get("profile", {}).get("email_address"),
        "mention_name": member.get("profile", {}).get("mention_name"),
    }


def format_story(story: Dict) -> Dict:
    """Format a story object to include only essential fields."""
    return {
        "id": story["id"],
        "name": story["name"],
        "description": story.get("description", ""),
        "story_type": story["story_type"],
        "workflow_state_id": story["workflow_state_id"],
        "app_url": story["app_url"],
        "created_at": story["created_at"],
        "updated_at": story["updated_at"],
        "completed": story.get("completed", False),
        "owner_ids": story.get("owner_ids", []),
        "requester_id": story.get("requested_by_id"),
        "iteration_id": story.get("iteration_id"),
        "epic_id": story.get("epic_id"),
        "estimate": story.get("estimate"),
        "labels": [
            {"id": label["id"], "name": label["name"]}
            for label in story.get("labels", [])
        ],
        "team_id": story.get("group_id"),
    }


def format_epic(epic: Dict) -> Dict:
    """Format an epic object to include only essential fields."""
    return {
        "id": epic["id"],
        "name": epic["name"],
        "description": epic.get("description", ""),
        "state": epic.get("state", ""),
        "app_url": epic["app_url"],
        "created_at": epic["created_at"],
        "updated_at": epic["updated_at"],
        "completed": epic.get("completed", False),
        "owner_ids": epic.get("owner_ids", []),
        "milestone_id": epic.get("milestone_id"),
        "labels": [
            {"id": label["id"], "name": label["name"]}
            for label in epic.get("labels", [])
        ],
    }


def format_iteration(iteration: Dict, include_stats: bool = True) -> Dict:
    """Format an iteration object to include only essential fields.

    Args:
        iteration: The iteration object to format
        include_stats: Whether to include stats in the output (default: True for backwards compatibility)
    """
    formatted = {
        "id": iteration["id"],
        "name": iteration["name"],
        "description": iteration.get("description", ""),
        "start_date": iteration["start_date"],
        "end_date": iteration["end_date"],
        "status": iteration["status"],
        "app_url": iteration["app_url"],
        "created_at": iteration["created_at"],
        "updated_at": iteration["updated_at"],
        "team_ids": iteration.get("group_ids", []),
    }

    if include_stats:
        formatted["stats"] = iteration.get("stats", {})

    return formatted


def format_team(team: Dict) -> Dict:
    """Format a team object to include only essential fields."""
    return {
        "id": team["id"],
        "name": team["name"],
        "mention_name": team.get("mention_name"),
        "description": team.get("description", ""),
        "app_url": team["app_url"],
        "num_members": len(team.get("member_ids", [])),
        "workflow_ids": team.get("workflow_ids", []),
    }


def format_workflow(workflow: Dict) -> Dict:
    """Format a workflow object to include only essential fields."""
    return {
        "id": workflow["id"],
        "name": workflow["name"],
        "description": workflow.get("description", ""),
        "team_id": workflow.get("team_id"),
        "created_at": workflow["created_at"],
        "updated_at": workflow["updated_at"],
        "states": [
            {
                "id": state["id"],
                "name": state["name"],
                "type": state["type"],
                "position": state.get("position", 0),
            }
            for state in workflow.get("states", [])
        ],
    }


def format_objective(objective: Dict) -> Dict:
    """Format an objective object to include only essential fields."""
    return {
        "id": objective["id"],
        "name": objective["name"],
        "description": objective.get("description", ""),
        "state": objective.get("state", ""),
        "app_url": objective["app_url"],
        "created_at": objective["created_at"],
        "updated_at": objective["updated_at"],
        "completed": objective.get("completed", False),
    }
