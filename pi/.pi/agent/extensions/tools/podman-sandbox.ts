/**
 * Podman sandbox provider.
 *
 * Example ~/.pi/agent/sandbox.json:
 *   { "type": "podman", "container": "pi-podman-sandbox" }
 */

import type {
    PodmanSandboxConfig,
    SandboxProvider,
} from "./sandbox-shared";
import { createContainerSandbox } from "./container-sandbox";

export function createPodmanSandbox(): SandboxProvider<PodmanSandboxConfig> {
    return createContainerSandbox({
        engine: "podman",
        displayName: "Podman",
        icon: "🦭",
        defaultContainer: "pi-podman-sandbox",
    });
}
