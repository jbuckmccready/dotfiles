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

    -- HACK:
    -- Setup capabilities to support utf-16, since copilot.vim only works with utf-16
    -- this is a workaround to the limitations of copilot language server
    -- Related issue: https://github.com/neovim/nvim-lspconfig/issues/2184
    caps = vim.tbl_deep_extend("force", caps, {
        offsetEncoding = { "utf-16" },
        general = {
            positionEncodings = { "utf-16" },
        },
    })

    return caps
end

-- WSL Clipboard configuration
if vim.fn.has("wsl") == 1 then
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
