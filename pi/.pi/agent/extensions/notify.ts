/**
 * Pi Notify Extension
 *
 * Sends a native OS notification when Pi agent is done and waiting for input.
 * Supports:
 * - macOS: terminal-notifier (preferred), osascript fallback
 * - Linux: notify-send
 * - WSL: PowerShell balloon tip with sound
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execFile, execFileSync } from "child_process";

function commandExists(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function notify(title: string, body: string): void {
  if (process.env.WSL_DISTRO_NAME) {
    // WSL: PowerShell balloon tip with sound
    const safeTitle = title.replace(/'/g, "\\'");
    const safeBody = body.replace(/'/g, "\\'");
    const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
(New-Object Media.SoundPlayer 'C:\\Windows\\Media\\ding.wav').Play()
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.BalloonTipTitle = '${safeTitle}'
$n.BalloonTipText = '${safeBody}'
$n.Visible = $true
$n.ShowBalloonTip(5000)
Start-Sleep -Seconds 5
$n.Dispose()
`;
    execFile("powershell.exe", ["-Command", ps], { stdio: "ignore" });
  } else if (commandExists("terminal-notifier")) {
    // macOS with terminal-notifier
    execFile("terminal-notifier", ["-title", title, "-message", body, "-sound", "Ping"]);
  } else if (commandExists("notify-send")) {
    // Linux
    execFile("notify-send", [title, body]);
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("agent_end", async () => {
    notify("Pi", "Ready for input");
  });
}
