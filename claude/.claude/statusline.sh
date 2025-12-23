#!/usr/bin/env bash

# Read JSON input from stdin
input=$(cat)

# Extract data from JSON
cwd=$(echo "$input" | jq -r '.cwd')
project_dir=$(echo "$input" | jq -r '.workspace.project_dir // .cwd')
input_tokens=$(echo "$input" | jq -r '.context_window.total_input_tokens // 0')
output_tokens=$(echo "$input" | jq -r '.context_window.total_output_tokens // 0')
max_tokens=$(echo "$input" | jq -r '.context_window.context_window_size // 200000')
model=$(echo "$input" | jq -r '.model.display_name // "Claude"')

total_tokens=$((input_tokens + output_tokens))

# Colors (Catppuccin Mocha)
yellow=$'\033[38;2;249;226;175m'
gray=$'\033[38;2;108;112;134m'
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

# Calculate context percentage
if [ "$max_tokens" -gt 0 ]; then
    pct=$((total_tokens * 100 / max_tokens))
else
    pct=0
fi

# Format token counts (e.g., 12.5k)
format_tokens() {
    local t=$1
    if [ "$t" -ge 1000 ]; then
        awk "BEGIN {printf \"%.1fk\", $t/1000}"
    else
        echo "$t"
    fi
}

in_display=$(format_tokens "$input_tokens")
out_display=$(format_tokens "$output_tokens")

# Output plain text
echo "${yellow}${pwd_display}${reset}${branch} ${gray}↓ ${in_display} ↑ ${out_display} (${pct}%) ${model}${reset}"
