#!/bin/bash
# Notification hook for Claude Code

INPUT=$(cat)
MESSAGE=$(echo "$INPUT" | jq -r '.message // empty')

# If no message field (Stop hook), use default
if [ -z "$MESSAGE" ]; then
    MESSAGE="Claude Code finished"
fi

TITLE="Claude Code"

if [[ -n "$WSL_DISTRO_NAME" ]]; then
    # WSL: use PowerShell toast notification (backgrounded to avoid blocking)
    TITLE=$(echo "$TITLE" | sed "s/'/\\\\'/g")
    MESSAGE=$(echo "$MESSAGE" | sed "s/'/\\\\'/g")

    powershell.exe -Command "
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
(New-Object Media.SoundPlayer 'C:\\Windows\\Media\\ding.wav').Play()
\$n = New-Object System.Windows.Forms.NotifyIcon
\$n.Icon = [System.Drawing.SystemIcons]::Information
\$n.BalloonTipTitle = '$TITLE'
\$n.BalloonTipText = '$MESSAGE'
\$n.Visible = \$true
\$n.ShowBalloonTip(5000)
Start-Sleep -Seconds 5
\$n.Dispose()
" &>/dev/null &

elif command -v terminal-notifier &>/dev/null; then
    # macOS with terminal-notifier
    terminal-notifier -title "$TITLE" -message "$MESSAGE" -sound Ping

elif command -v osascript &>/dev/null; then
    # macOS fallback
    osascript -e "display notification \"$MESSAGE\" with title \"$TITLE\" sound name \"Ping\""

elif command -v notify-send &>/dev/null; then
    # Linux (GNOME, KDE, etc.)
    notify-send "$TITLE" "$MESSAGE"
fi
