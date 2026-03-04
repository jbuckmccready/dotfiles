import assert from "node:assert/strict";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { hostToGuestPath } from "./gondolin-sandbox.ts";

const hostHome = homedir();
const hostTmp = tmpdir();

const CWD = "/home/testuser/project";

const cases = [
    {
        name: "1. maps '~' to VM home",
        localCwd: CWD,
        localPath: "~",
        expected: "/root",
    },
    {
        name: "2. maps '~/' prefix to VM home subpath",
        localCwd: CWD,
        localPath: "~/.config/nvim/init.lua",
        expected: "/root/.config/nvim/init.lua",
    },
    {
        name: "3. maps host home absolute path to VM home",
        localCwd: CWD,
        localPath: hostHome,
        expected: "/root",
    },
    {
        name: "4. maps host home child absolute path to VM home child",
        localCwd: CWD,
        localPath: path.join(hostHome, ".ssh", "config"),
        expected: "/root/.ssh/config",
    },
    {
        name: "5. maps relative workspace path into /workspace",
        localCwd: CWD,
        localPath: "src/main.ts",
        expected: "/workspace/src/main.ts",
    },
    {
        name: "6. maps absolute path inside workspace into /workspace",
        localCwd: CWD,
        localPath: path.join(CWD, "src", "main.ts"),
        expected: "/workspace/src/main.ts",
    },
    {
        name: "7. maps host tmpdir to guest tmpdir",
        localCwd: CWD,
        localPath: hostTmp,
        expected: "/tmp/pi-host-tmp",
    },
    {
        name: "7b. maps file under host tmpdir to guest tmpdir child",
        localCwd: CWD,
        localPath: path.join(hostTmp, "pi-clipboard-abc123.png"),
        expected: "/tmp/pi-host-tmp/pi-clipboard-abc123.png",
    },
    {
        name: "8. resolves relative paths that escape workspace from /workspace",
        localCwd: CWD,
        localPath: "../outside.txt",
        expected: "/outside.txt",
    },
];

for (const c of cases) {
    test(c.name, () => {
        assert.equal(hostToGuestPath(c.localCwd, c.localPath), c.expected);
    });
}
