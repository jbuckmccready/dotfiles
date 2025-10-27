#!/usr/bin/env python3
"""Shortcut Users/Members - Operations for user management."""

import sys
import json
import argparse
from typing import Dict, List
from shortcut_client import ShortcutClient, format_member, get_current_user


def get_member(member_id: str) -> Dict:
    """Get a single member by ID."""
    client = ShortcutClient()
    member = client.get(f"members/{member_id}")
    return format_member(member)


def list_members() -> List[Dict]:
    """List all workspace members."""
    client = ShortcutClient()
    members = client.get("members")
    return [format_member(m) for m in members]


def get_current_member() -> Dict:
    """Get the current authenticated user."""
    return get_current_user()


def get_current_teams() -> List[Dict]:
    """Get teams where the current user is a member."""
    from shortcut_client import format_team

    current_user = get_current_user()
    current_user_id = current_user["id"]

    # Get all teams and filter by membership
    client = ShortcutClient()
    all_teams = client.get("groups")

    # Filter teams where current user is a member
    user_teams = [
        team for team in all_teams if current_user_id in team.get("member_ids", [])
    ]

    return [format_team(team) for team in user_teams]


def main():
    parser = argparse.ArgumentParser(description="Shortcut Users/Members Operations")
    subparsers = parser.add_subparsers(dest="command")

    get_parser = subparsers.add_parser("get")
    get_parser.add_argument("member_id")

    subparsers.add_parser("list")
    subparsers.add_parser("current")
    subparsers.add_parser("current-teams")

    args = parser.parse_args()

    try:
        if args.command == "get":
            result = get_member(args.member_id)
        elif args.command == "list":
            result = list_members()
        elif args.command == "current":
            result = get_current_member()
        elif args.command == "current-teams":
            result = get_current_teams()
        else:
            parser.print_help()
            sys.exit(1)

        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
