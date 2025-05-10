return {
    "mrcjkb/rustaceanvim",
    version = "^6",
    lazy = false, -- This plugin is already lazy
    init = function()
        local scratch_dir = vim.fn.stdpath("data") .. "/scratch"
        vim.g.rustaceanvim = {
            -- Plugin configuration
            tools = {
                -- Don't run clippy on save
                enable_clippy = false,
            },
            -- LSP configuration
            server = {
                auto_attach = function(bufnr)
                    local path = vim.fn.bufname(bufnr)
                    -- Don't attempt to attach to scratch files (leads to error since no cargo.toml)
                    if path:find(scratch_dir, 1, true) then
                        return false
                    end

                    return true
                end,
                on_attach = function(client, bufnr)
                    vim.keymap.set({ "n" }, "<leader>lo", function()
                        vim.cmd.RustLsp("openDocs")
                    end, { buffer = bufnr, desc = "Open Docs" })

                    vim.keymap.set({ "n" }, "<leader>le", function()
                        vim.cmd.RustLsp("expandMacro")
                    end, { buffer = bufnr, desc = "Expand Macro" })
                end,
                capabilities = {},
                load_vscode_settings = false,
            },
            -- DAP configuration
            dap = {},
        }
    end,
}
