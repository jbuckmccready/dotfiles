#!/bin/bash
# Notification hook for Claude Code

INPUT=$(cat)
MESSAGE=$(echo "$INPUT" | jq -r '.message // empty')

# If no message field (Stop hook), use default
if [ -z "$MESSAGE" ]; then
    MESSAGE="Claude Code finished"
fi

if command -v terminal-notifier &> /dev/null; then
    terminal-notifier -title "Claude Code" -message "$MESSAGE" -sound Ping
else
    osascript -e "display notification \"$MESSAGE\" with title \"Claude Code\" sound name \"Ping\""
fi
