local make_client_capabilities = vim.lsp.protocol.make_client_capabilities
function vim.lsp.protocol.make_client_capabilities()
    local caps = make_client_capabilities()

    -- FIXME: workaround for https://github.com/neovim/neovim/issues/28058
    -- Error pops up when opening .go files without this workaround
    if not (caps.workspace or {}).didChangeWatchedFiles then
        vim.notify("lsp capability didChangeWatchedFiles is already disabled", vim.log.levels.WARN)
    else
        caps.workspace.didChangeWatchedFiles = nil
    end

    return caps
end

-- WSL-specific configuration
if vim.fn.has("wsl") == 1 then
    vim.keymap.set("n", "gx", function()
        local url = vim.fn.expand("<cfile>")
        vim.fn.system({ "wslview", url })
    end, { desc = "Open URL in Windows browser via wslview" })
    vim.g.clipboard = {
        name = "win32yank-wsl",
        copy = {
            ["+"] = "win32yank.exe -i --crlf",
            ["*"] = "win32yank.exe -i --crlf",
        },
        paste = {
            ["+"] = "win32yank.exe -o --lf",
            ["*"] = "win32yank.exe -o --lf",
        },
        cache_enabled = 0,
    }
end
