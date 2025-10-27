#!/usr/bin/env python3
"""Shortcut Iterations - Operations for managing iterations."""

import sys
import json
import argparse
from typing import Dict, List, Optional
from shortcut_client import ShortcutClient, format_iteration


def get_iteration(iteration_id: int) -> Dict:
    """Get a single iteration by ID."""
    client = ShortcutClient()
    iteration = client.get(f"iterations/{iteration_id}")
    return format_iteration(iteration)


def list_iterations(
    include_stats: bool = False, status: Optional[str] = None
) -> List[Dict]:
    """List all iterations.

    Args:
        include_stats: Whether to include stats in the output
        status: Filter by status (started, unstarted, done)
    """
    client = ShortcutClient()
    iterations = client.get("iterations")

    # Filter by status if specified
    if status:
        iterations = [it for it in iterations if it.get("status") == status]

    return [format_iteration(it, include_stats=include_stats) for it in iterations]


def create_iteration(
    name: str,
    start_date: str,
    end_date: str,
    description: Optional[str] = None,
    team_ids: Optional[List[str]] = None,
) -> Dict:
    """
    Create a new iteration.

    Args:
        name: Iteration name
        start_date: Start date (YYYY-MM-DD format)
        end_date: End date (YYYY-MM-DD format)
        description: Optional description
        team_ids: List of team IDs
    """
    client = ShortcutClient()

    iteration_data = {"name": name, "start_date": start_date, "end_date": end_date}
    if description:
        iteration_data["description"] = description
    if team_ids:
        iteration_data["group_ids"] = team_ids

    iteration = client.post("iterations", iteration_data)
    return format_iteration(iteration)


def update_iteration(
    iteration_id: int,
    name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    description: Optional[str] = None,
    team_ids: Optional[List[str]] = None,
) -> Dict:
    """Update an existing iteration."""
    client = ShortcutClient()

    update_data = {}
    if name is not None:
        update_data["name"] = name
    if start_date is not None:
        update_data["start_date"] = start_date
    if end_date is not None:
        update_data["end_date"] = end_date
    if description is not None:
        update_data["description"] = description
    if team_ids is not None:
        update_data["group_ids"] = team_ids

    iteration = client.put(f"iterations/{iteration_id}", update_data)
    return format_iteration(iteration)


def delete_iteration(iteration_id: int) -> Dict:
    """Delete an iteration."""
    client = ShortcutClient()
    client.delete(f"iterations/{iteration_id}")
    return {"success": True, "message": f"Iteration {iteration_id} deleted"}


def main():
    parser = argparse.ArgumentParser(description="Shortcut Iterations Operations")
    subparsers = parser.add_subparsers(dest="command")

    get_parser = subparsers.add_parser("get")
    get_parser.add_argument("iteration_id", type=int)

    list_parser = subparsers.add_parser("list")
    list_parser.add_argument(
        "--with-stats", action="store_true", help="Include statistics in the output"
    )
    list_parser.add_argument(
        "--status",
        choices=["started", "unstarted", "done"],
        help="Filter by iteration status",
    )

    create_parser = subparsers.add_parser("create")
    create_parser.add_argument("name")
    create_parser.add_argument("start_date", help="YYYY-MM-DD format")
    create_parser.add_argument("end_date", help="YYYY-MM-DD format")
    create_parser.add_argument("--description")
    create_parser.add_argument("--team-ids", nargs="+")

    update_parser = subparsers.add_parser("update")
    update_parser.add_argument("iteration_id", type=int)
    update_parser.add_argument("--name")
    update_parser.add_argument("--start-date")
    update_parser.add_argument("--end-date")
    update_parser.add_argument("--description")

    delete_parser = subparsers.add_parser("delete")
    delete_parser.add_argument("iteration_id", type=int)

    args = parser.parse_args()

    try:
        if args.command == "get":
            result = get_iteration(args.iteration_id)
        elif args.command == "list":
            result = list_iterations(
                include_stats=args.with_stats,
                status=args.status if hasattr(args, "status") else None,
            )
        elif args.command == "create":
            result = create_iteration(
                args.name,
                args.start_date,
                args.end_date,
                args.description,
                args.team_ids if hasattr(args, "team_ids") else None,
            )
        elif args.command == "update":
            result = update_iteration(
                args.iteration_id,
                args.name if hasattr(args, "name") else None,
                args.start_date if hasattr(args, "start_date") else None,
                args.end_date if hasattr(args, "end_date") else None,
                args.description if hasattr(args, "description") else None,
            )
        elif args.command == "delete":
            result = delete_iteration(args.iteration_id)
        else:
            parser.print_help()
            sys.exit(1)

        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
