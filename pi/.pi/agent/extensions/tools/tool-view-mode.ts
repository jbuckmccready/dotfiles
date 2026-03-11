export type ToolViewMode = "minimal" | "condensed" | "expanded";

const MODE_CYCLE: ToolViewMode[] = ["minimal", "condensed", "expanded"];

let currentMode: ToolViewMode = "minimal";

export function getToolViewMode(): ToolViewMode {
    return currentMode;
}

export function setToolViewMode(mode: ToolViewMode): void {
    currentMode = mode;
}

export function cycleToolViewMode(): ToolViewMode {
    const idx = MODE_CYCLE.indexOf(currentMode);
    currentMode = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    return currentMode;
}

export function toolViewModeExpanded(): boolean {
    return currentMode === "expanded";
}
