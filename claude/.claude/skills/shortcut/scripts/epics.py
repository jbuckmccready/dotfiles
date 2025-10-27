#!/usr/bin/env python3
"""Shortcut Epics - Operations for managing epics."""

import sys
import json
import argparse
from typing import Dict, List, Optional
from shortcut_client import ShortcutClient, format_epic


def get_epic(epic_id: int) -> Dict:
    """Get a single epic by ID."""
    client = ShortcutClient()
    epic = client.get(f"epics/{epic_id}")
    return format_epic(epic)


def list_epics() -> List[Dict]:
    """List all epics."""
    client = ShortcutClient()
    epics = client.get("epics")
    return [format_epic(epic) for epic in epics]


def search_epics(
    query: Optional[str] = None, state: Optional[str] = None
) -> List[Dict]:
    """Search epics."""
    client = ShortcutClient()
    params = {}
    if query:
        params["query"] = query
    if state:
        params["state"] = state

    epics = client.get("epics", params=params)
    return [format_epic(epic) for epic in epics]


def create_epic(
    name: str,
    description: Optional[str] = None,
    state: str = "to do",
    owner_ids: Optional[List[str]] = None,
    milestone_id: Optional[int] = None,
) -> Dict:
    """Create a new epic."""
    client = ShortcutClient()

    epic_data = {"name": name, "state": state}
    if description:
        epic_data["description"] = description
    if owner_ids:
        epic_data["owner_ids"] = owner_ids
    if milestone_id:
        epic_data["milestone_id"] = milestone_id

    epic = client.post("epics", epic_data)
    return format_epic(epic)


def update_epic(
    epic_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    state: Optional[str] = None,
    owner_ids: Optional[List[str]] = None,
    archived: Optional[bool] = None,
) -> Dict:
    """Update an existing epic."""
    client = ShortcutClient()

    update_data = {}
    if name is not None:
        update_data["name"] = name
    if description is not None:
        update_data["description"] = description
    if state is not None:
        update_data["state"] = state
    if owner_ids is not None:
        update_data["owner_ids"] = owner_ids
    if archived is not None:
        update_data["archived"] = archived

    epic = client.put(f"epics/{epic_id}", update_data)
    return format_epic(epic)


def delete_epic(epic_id: int) -> Dict:
    """Delete an epic."""
    client = ShortcutClient()
    client.delete(f"epics/{epic_id}")
    return {"success": True, "message": f"Epic {epic_id} deleted"}


def main():
    parser = argparse.ArgumentParser(description="Shortcut Epics Operations")
    subparsers = parser.add_subparsers(dest="command")

    get_parser = subparsers.add_parser("get")
    get_parser.add_argument("epic_id", type=int)

    subparsers.add_parser("list")

    search_parser = subparsers.add_parser("search")
    search_parser.add_argument("--query")
    search_parser.add_argument("--state")

    create_parser = subparsers.add_parser("create")
    create_parser.add_argument("name")
    create_parser.add_argument("--description")
    create_parser.add_argument("--state", default="to do")
    create_parser.add_argument("--owner-ids", nargs="+")

    update_parser = subparsers.add_parser("update")
    update_parser.add_argument("epic_id", type=int)
    update_parser.add_argument("--name")
    update_parser.add_argument("--description")
    update_parser.add_argument("--state")
    update_parser.add_argument("--archived", action="store_true")

    delete_parser = subparsers.add_parser("delete")
    delete_parser.add_argument("epic_id", type=int)

    args = parser.parse_args()

    try:
        if args.command == "get":
            result = get_epic(args.epic_id)
        elif args.command == "list":
            result = list_epics()
        elif args.command == "search":
            result = search_epics(args.query, args.state)
        elif args.command == "create":
            result = create_epic(
                args.name, args.description, args.state, args.owner_ids
            )
        elif args.command == "update":
            result = update_epic(
                args.epic_id,
                args.name,
                args.description,
                args.state,
                args.owner_ids if hasattr(args, "owner_ids") else None,
                args.archived if hasattr(args, "archived") else None,
            )
        elif args.command == "delete":
            result = delete_epic(args.epic_id)
        else:
            parser.print_help()
            sys.exit(1)

        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
