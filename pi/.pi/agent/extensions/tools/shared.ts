import stripAnsi from "strip-ansi";
import { truncateToWidth } from "@mariozechner/pi-tui";
import { homedir } from "os";

/**
 * Sanitize binary output for display/storage.
 * Removes characters that crash string-width or cause display issues:
 * - Control characters (except tab, newline, carriage return)
 * - Lone surrogates
 * - Unicode Format characters (crash string-width due to a bug)
 * - Characters with undefined code points
 */
function sanitizeBinaryOutput(text: string): string {
    return Array.from(text)
        .filter((char) => {
            const code = char.codePointAt(0);
            if (code === undefined) return false;
            if (code === 0x09 || code === 0x0a || code === 0x0d) return true;
            if (code <= 0x1f) return false;
            if (code >= 0xfff9 && code <= 0xfffb) return false;
            return true;
        })
        .join("");
}

export function sanitizeToolText(text: string): string {
    return sanitizeBinaryOutput(stripAnsi(text)).replace(/\r/g, "");
}

export function getSanitizedTextOutput(result: any): string {
    const textBlocks =
        result.content?.filter((c: any) => c.type === "text") || [];
    return textBlocks
        .map((c: any) => sanitizeToolText(c.text || ""))
        .join("\n");
}

export function makeSep(borderAnsi: string, width: number): string {
    return borderAnsi + "─".repeat(width) + "\x1b[39m";
}

export function component(renderFn: (width: number) => string[]) {
    let cachedWidth: number | undefined;
    let cachedLines: string[] | undefined;
    return {
        invalidate() {
            cachedWidth = undefined;
            cachedLines = undefined;
        },
        render(width: number) {
            if (cachedLines && cachedWidth === width) return cachedLines;
            cachedLines = renderFn(width).map((l) =>
                truncateToWidth(l, width),
            );
            cachedWidth = width;
            return cachedLines;
        },
    } as any;
}

export function shortenPath(path: string): string {
    const home = homedir();
    return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

export function replaceTabs(text: string): string {
    return text.replace(/\t/g, "   ");
}
