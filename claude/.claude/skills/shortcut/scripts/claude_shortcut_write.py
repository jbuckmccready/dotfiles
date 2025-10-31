"""
Claude Shortcut Write - CLI wrapper for write Shortcut operations.

Routes commands to the appropriate script for write operations only.
These operations require explicit user approval via permissions.

Usage:
    claude-shortcut-write <entity> <operation> [args...]

Examples:
    claude-shortcut-write stories create "Fix login bug" --type bug
    claude-shortcut-write stories update 123 --name "New title"
    claude-shortcut-write stories delete 123
    claude-shortcut-write stories comment 123 "Added comment"
    claude-shortcut-write epics create "Q1 Goals"
    claude-shortcut-write iterations create "Sprint 1" 2025-01-01 2025-01-14
"""

import sys
import subprocess
from pathlib import Path

# Define write operations for each entity type
WRITE_OPERATIONS = {
    "stories": ["create", "update", "delete", "comment"],
    "epics": ["create", "update", "delete"],
    "iterations": ["create", "update", "delete"],
    "objectives": ["create", "update", "delete"],
    "documents": ["create"],
}


def main():
    if len(sys.argv) < 3:
        print(
            "Usage: claude-shortcut-write <entity> <operation> [args...]",
            file=sys.stderr,
        )
        print(
            "\nAvailable entities:",
            ", ".join(sorted(WRITE_OPERATIONS.keys())),
            file=sys.stderr,
        )
        sys.exit(1)

    entity = sys.argv[1]
    operation = sys.argv[2]
    remaining_args = sys.argv[3:]

    # Validate entity
    if entity not in WRITE_OPERATIONS:
        print(f"Error: Unknown entity '{entity}'", file=sys.stderr)
        print(
            f"Available entities: {', '.join(sorted(WRITE_OPERATIONS.keys()))}",
            file=sys.stderr,
        )
        sys.exit(1)

    # Validate operation is a write operation
    if operation not in WRITE_OPERATIONS[entity]:
        print(
            f"Error: Operation '{operation}' is not a write operation for '{entity}'",
            file=sys.stderr,
        )
        print(
            f"Available write operations: {', '.join(WRITE_OPERATIONS[entity])}",
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
