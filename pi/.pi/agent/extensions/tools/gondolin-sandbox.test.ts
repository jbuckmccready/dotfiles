import assert from "node:assert/strict";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";
import { toGuestPath } from "./gondolin-sandbox.ts";

const hostHome = homedir();

const cases = [
    {
        name: "1. maps '~' to VM home",
        localCwd: "/Users/jbm/dotfiles",
        localPath: "~",
        expected: "/root",
    },
    {
        name: "2. maps '~/' prefix to VM home subpath",
        localCwd: "/Users/jbm/dotfiles",
        localPath: "~/.config/nvim/init.lua",
        expected: "/root/.config/nvim/init.lua",
    },
    {
        name: "3. maps host home absolute path to VM home",
        localCwd: "/Users/jbm/dotfiles",
        localPath: hostHome,
        expected: "/root",
    },
    {
        name: "4. maps host home child absolute path to VM home child",
        localCwd: "/Users/jbm/dotfiles",
        localPath: path.join(hostHome, ".ssh", "config"),
        expected: "/root/.ssh/config",
    },
    {
        name: "5. maps relative workspace path into /workspace",
        localCwd: "/Users/jbm/dotfiles",
        localPath: "nvim/.config/nvim/init.lua",
        expected: "/workspace/nvim/.config/nvim/init.lua",
    },
    {
        name: "6. maps absolute path inside workspace into /workspace",
        localCwd: "/Users/jbm/dotfiles",
        localPath: "/Users/jbm/dotfiles/git/.gitconfig",
        expected: "/workspace/git/.gitconfig",
    },
    {
        name: "7. keeps absolute non-home paths unchanged",
        localCwd: "/Users/jbm/dotfiles",
        localPath: "/tmp/file.txt",
        expected: "/tmp/file.txt",
    },
    {
        name: "8. resolves relative paths that escape workspace from /workspace",
        localCwd: "/Users/jbm/dotfiles",
        localPath: "../outside.txt",
        expected: "/outside.txt",
    },
];

for (const c of cases) {
    test(c.name, () => {
        assert.equal(toGuestPath(c.localCwd, c.localPath), c.expected);
    });
}
