/**
 * Pi Notify Extension
 *
 * Sends a native OS notification when Pi agent is done and waiting for input.
 * Supports:
 * - macOS: terminal-notifier (preferred), osascript fallback
 * - Linux: notify-send
 * - WSL: PowerShell balloon tip with sound
 * If PI_NOTIFY_BRIDGE is set and inside Docker, writes a JSON signal file to
 * ~/.pi/notifications/ for a host-side watcher. Otherwise uses native notification tools.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function commandExists(cmd: string): boolean {
    try {
        execFileSync("which", [cmd], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

function notify(title: string, body: string): void {
    if (existsSync("/.dockerenv") && process.env.PI_NOTIFY_BRIDGE) {
        const dir = join(homedir(), ".pi", "notifications");
        mkdirSync(dir, { recursive: true });
        const ts = Date.now();
        const filename = `${ts}-${Math.random().toString(36).slice(2, 8)}.json`;
        writeFileSync(
            join(dir, filename),
            JSON.stringify({ title, body, ts }) + "\n",
        );
        return;
    }

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
        execFile("powershell.exe", ["-Command", ps], () => {});
    } else if (commandExists("terminal-notifier")) {
        // macOS with terminal-notifier
        execFile(
            "terminal-notifier",
            ["-title", title, "-message", body, "-sound", "Ping"],
            () => {},
        );
    } else if (commandExists("notify-send")) {
        // Linux
        execFile("notify-send", [title, body], () => {});
    }
}

export default function (pi: ExtensionAPI) {
    pi.on("agent_end", async () => {
        notify("Pi", "Ready for input");
    });
}
