#!/usr/bin/env bash

# Read JSON input from stdin
input=$(cat)

# Extract data from JSON
cwd=$(echo "$input" | jq -r '.cwd')
project_dir=$(echo "$input" | jq -r '.workspace.project_dir // .cwd')
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
model=$(echo "$input" | jq -r '.model.display_name // "Claude"')

# Colors (Catppuccin Mocha)
yellow=$'\033[38;2;249;226;175m'
gray=$'\033[38;2;108;112;134m'
lavender=$'\033[38;2;180;190;254m'
reset=$'\033[0m'

# Format directory display
project_display="${project_dir/#$HOME/~}"

if [ "$cwd" = "$project_dir" ]; then
    pwd_display="$project_display"
else
    # Get relative path from project to cwd
    relative_path="${cwd#$project_dir/}"
    pwd_display="$project_display →  $relative_path"
fi

# Get git branch
branch=""
if git -C "$cwd" rev-parse --git-dir >/dev/null 2>&1; then
    branch=$(git --no-optional-locks -C "$cwd" symbolic-ref --short HEAD 2>/dev/null ||
        git --no-optional-locks -C "$cwd" rev-parse --short HEAD 2>/dev/null)
    dirty=""
    if ! git --no-optional-locks -C "$cwd" diff-index --quiet HEAD 2>/dev/null ||
        [ -n "$(git --no-optional-locks -C "$cwd" ls-files --others --exclude-standard 2>/dev/null)" ]; then
        dirty="*"
    fi
    branch=" ${gray}${branch}${dirty}${reset}"
fi

# Generate progress bar
bar_width=10
filled=$((used_pct * bar_width / 100))
empty=$((bar_width - filled))
bar=$(printf '█%.0s' $(seq 1 $filled 2>/dev/null))$(printf '░%.0s' $(seq 1 $empty 2>/dev/null))

# Output plain text
echo "${yellow}${pwd_display}${reset}${branch} ${gray}│ ${model} │ ${lavender}${bar} ${used_pct}%${reset}"
