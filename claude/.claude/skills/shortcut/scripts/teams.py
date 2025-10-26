#!/usr/bin/env python3
"""Shortcut Teams - Operations for team management."""

import sys
import json
import argparse
from typing import Dict, List
from shortcut_client import ShortcutClient, format_team


def get_team(team_id: str) -> Dict:
    """Get a single team by ID."""
    client = ShortcutClient()
    team = client.get(f"groups/{team_id}")
    return format_team(team)


def list_teams() -> List[Dict]:
    """List all teams in the workspace."""
    client = ShortcutClient()
    teams = client.get("groups")
    return [format_team(t) for t in teams]


def main():
    parser = argparse.ArgumentParser(description="Shortcut Teams Operations")
    subparsers = parser.add_subparsers(dest="command")

    get_parser = subparsers.add_parser("get")
    get_parser.add_argument("team_id")

    subparsers.add_parser("list")

    args = parser.parse_args()

    try:
        if args.command == "get":
            result = get_team(args.team_id)
        elif args.command == "list":
            result = list_teams()
        else:
            parser.print_help()
            sys.exit(1)

        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
