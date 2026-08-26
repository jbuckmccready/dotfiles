/**
 * Docker sandbox provider.
 *
 * Example ~/.pi/agent/sandbox.json:
 *   { "type": "docker", "container": "agent-sandbox" }
 *
 * Example docker run:
 *   docker run -d --name agent-sandbox \
 *     -v ~/workspace:/workspace \
 *     -v ~/.pi/agent/skills:/root/.pi/agent/skills:ro \
 *     node:22 sleep infinity
 *
 * WSL2 + Docker Desktop note: if Docker Desktop starts before the WSL
 * distro, `docker inspect` may report mangled bind-mount source paths
 * (e.g. /run/desktop/mnt/host/wsl/docker-desktop-bind-mounts/Ubuntu/<hash>)
 * instead of the real WSL paths, breaking host→container path translation.
 * Starting the WSL distro first and then launching Docker Desktop avoids
 * this issue.
 */

import type {
    DockerSandboxConfig,
    SandboxProvider,
} from "./sandbox-shared";
import { createContainerSandbox } from "./container-sandbox";

export function createDockerSandbox(): SandboxProvider<DockerSandboxConfig> {
    return createContainerSandbox({
        engine: "docker",
        displayName: "Docker",
        icon: "🐳",
        defaultContainer: "agent-sandbox",
    });
}
