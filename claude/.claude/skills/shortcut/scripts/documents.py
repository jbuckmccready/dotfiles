#!/usr/bin/env python3
"""Shortcut Documents - Operations for document management."""

import sys
import json
import argparse
from typing import Dict
from shortcut_client import ShortcutClient


def create_document(name: str, content: str) -> Dict:
    """
    Create a new document with HTML content.

    Args:
        name: Document name/title
        content: HTML content for the document

    Returns:
        Created document info
    """
    client = ShortcutClient()

    document_data = {"name": name, "content": content}

    document = client.post("docs", document_data)

    return {
        "id": document["id"],
        "name": document["name"],
        "app_url": document["app_url"],
        "created_at": document["created_at"],
    }


def main():
    parser = argparse.ArgumentParser(description="Shortcut Documents Operations")
    subparsers = parser.add_subparsers(dest="command")

    create_parser = subparsers.add_parser("create")
    create_parser.add_argument("name", help="Document name")
    create_parser.add_argument("content", help="HTML content")

    args = parser.parse_args()

    try:
        if args.command == "create":
            result = create_document(args.name, args.content)
        else:
            parser.print_help()
            sys.exit(1)

        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}, indent=2), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
