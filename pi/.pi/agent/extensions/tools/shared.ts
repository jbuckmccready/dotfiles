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
            cachedLines = renderFn(width).map((l) => truncateToWidth(l, width));
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

/**
 * Detect image MIME type from the first bytes of a file using magic byte signatures.
 * Needs at least 12 bytes for full detection (WebP). Returns null if not a recognized image.
 */
export function detectImageMimeFromBytes(buf: Buffer): string | null {
    if (buf.length < 3) return null;
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
        return "image/jpeg";
    // PNG: 89 50 4E 47
    if (
        buf.length >= 4 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47
    )
        return "image/png";
    // GIF: 47 49 46 38 ("GIF8")
    if (
        buf.length >= 4 &&
        buf[0] === 0x47 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x38
    )
        return "image/gif";
    // WebP: RIFF....WEBP
    if (
        buf.length >= 12 &&
        buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50
    )
        return "image/webp";
    return null;
}
