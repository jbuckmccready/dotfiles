#!/usr/bin/env python3
"""Shortcut Objectives - Operations for objective management."""

import sys
import json
import argparse
from typing import Dict, List, Optional
from shortcut_client import ShortcutClient, format_objective


def get_objective(objective_id: str) -> Dict:
    """Get a single objective by ID."""
    client = ShortcutClient()
    objective = client.get(f"objectives/{objective_id}")
    return format_objective(objective)


def list_objectives() -> List[Dict]:
    """List all objectives."""
    client = ShortcutClient()
    objectives = client.get("objectives")
    return [format_objective(obj) for obj in objectives]


def create_objective(
    name: str,
    description: Optional[str] = None
) -> Dict:
    """Create a new objective."""
    client = ShortcutClient()

    objective_data = {"name": name}
    if description:
        objective_data["description"] = description

    objective = client.post("objectives", objective_data)
    return format_objective(objective)


def update_objective(
    objective_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    state: Optional[str] = None
) -> Dict:
    """Update an existing objective."""
    client = ShortcutClient()

    update_data = {}
    if name is not None:
        update_data["name"] = name
    if description is not None:
        update_data["description"] = description
    if state is not None:
        update_data["state"] = state

    objective = client.put(f"objectives/{objective_id}", update_data)
    return format_objective(objective)


def delete_objective(objective_id: str) -> Dict:
    """Delete an objective."""
    client = ShortcutClient()
    client.delete(f"objectives/{objective_id}")
    return {"success": True, "message": f"Objective {objective_id} deleted"}


def main():
    parser = argparse.ArgumentParser(description="Shortcut Objectives Operations")
    subparsers = parser.add_subparsers(dest="command")

    get_parser = subparsers.add_parser("get")
    get_parser.add_argument("objective_id")

    subparsers.add_parser("list")

    create_parser = subparsers.add_parser("create")
    create_parser.add_argument("name")
    create_parser.add_argument("--description")

    update_parser = subparsers.add_parser("update")
    update_parser.add_argument("objective_id")
    update_parser.add_argument("--name")
    update_parser.add_argument("--description")
    update_parser.add_argument("--state")

    delete_parser = subparsers.add_parser("delete")
    delete_parser.add_argument("objective_id")

    args = parser.parse_args()

    try:
        if args.command == "get":
            result = get_objective(args.objective_id)
        elif args.command == "list":
            result = list_objectives()
        elif args.command == "create":
            result = create_objective(args.name, args.description)
        elif args.command == "update":
            result = update_objective(
                args.objective_id,
                args.name if hasattr(args, 'name') else None,
                args.description if hasattr(args, 'description') else None,
                args.state if hasattr(args, 'state') else None
            )
        elif args.command == "delete":
            result = delete_objective(args.objective_id)
        else:
            parser.print_help()
            sys.exit(1)

        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
