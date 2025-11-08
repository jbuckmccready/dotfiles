"""
Shortcut API Read - CLI wrapper for read-only Shortcut operations.

Routes commands to the appropriate script for read operations only.
This allows auto-approval of read operations via permissions while
requiring explicit approval for write operations.

Usage:
    shortcut-api-read <entity> <operation> [args...]

Examples:
    shortcut-api-read stories get 123
    shortcut-api-read stories search --query "bug"
    shortcut-api-read stories branch-name 123
    shortcut-api-read teams list
    shortcut-api-read iterations list --status started
"""

import sys
import subprocess
from pathlib import Path

# Define read-only operations for each entity type
READ_OPERATIONS = {
    "stories": ["get", "search", "branch-name"],
    "epics": ["get", "list", "search"],
    "iterations": ["get", "list"],
    "teams": ["get", "list"],
    "workflows": ["get", "list"],
    "users": ["get", "list", "current", "current-teams"],
    "objectives": ["get", "list"],
}


def main():
    if len(sys.argv) < 3:
        print(
            "Usage: shortcut-api-read <entity> <operation> [args...]",
            file=sys.stderr,
        )
        print(
            "\nAvailable entities:",
            ", ".join(sorted(READ_OPERATIONS.keys())),
            file=sys.stderr,
        )
        sys.exit(1)

    entity = sys.argv[1]
    operation = sys.argv[2]
    remaining_args = sys.argv[3:]

    # Validate entity
    if entity not in READ_OPERATIONS:
        print(f"Error: Unknown entity '{entity}'", file=sys.stderr)
        print(
            f"Available entities: {', '.join(sorted(READ_OPERATIONS.keys()))}",
            file=sys.stderr,
        )
        sys.exit(1)

    # Validate operation is read-only
    if operation not in READ_OPERATIONS[entity]:
        print(
            f"Error: Operation '{operation}' is not a read operation for '{entity}'",
            file=sys.stderr,
        )
        print(
            f"Available read operations: {', '.join(READ_OPERATIONS[entity])}",
            file=sys.stderr,
        )
        sys.exit(1)

    # Build path to the appropriate script
    script_dir = Path(__file__).parent
    script_path = script_dir / f"{entity}.py"

    if not script_path.exists():
        print(f"Error: Script not found: {script_path}", file=sys.stderr)
        sys.exit(1)

    # Execute the script with the operation and remaining arguments
    cmd = [str(script_path), operation] + remaining_args
    result = subprocess.run(cmd)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
