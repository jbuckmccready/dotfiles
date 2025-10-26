#!/usr/bin/env python3
"""Shortcut Workflows - Operations for workflow management."""

import sys
import json
import argparse
from typing import Dict, List
from shortcut_client import ShortcutClient, format_workflow


def get_workflow(workflow_id: int) -> Dict:
    """Get a single workflow by ID."""
    client = ShortcutClient()
    workflow = client.get(f"workflows/{workflow_id}")
    return format_workflow(workflow)


def list_workflows() -> List[Dict]:
    """List all workflows in the workspace."""
    client = ShortcutClient()
    workflows = client.get("workflows")
    return [format_workflow(w) for w in workflows]


def main():
    parser = argparse.ArgumentParser(description="Shortcut Workflows Operations")
    subparsers = parser.add_subparsers(dest="command")

    get_parser = subparsers.add_parser("get")
    get_parser.add_argument("workflow_id", type=int)

    subparsers.add_parser("list")

    args = parser.parse_args()

    try:
        if args.command == "get":
            result = get_workflow(args.workflow_id)
        elif args.command == "list":
            result = list_workflows()
        else:
            parser.print_help()
            sys.exit(1)

        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
