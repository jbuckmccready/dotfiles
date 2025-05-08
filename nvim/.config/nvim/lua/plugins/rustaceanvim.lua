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
                on_attach = {},
                capabilities = {},
                load_vscode_settings = false,
                default_settings = {
                    -- rust-analyzer language server configuration
                    ["rust-analyzer"] = {
                        rustfmt = {
                            -- nightly rust fmt
                            extraArgs = { require("config.settings").rust_fmt_extra_args },
                        },
                        -- increase limit to 1024 for searching across workspace (defaults to only 128)
                        workspace = { symbol = { search = { limit = 1024 } } },
                        cargo = {
                            -- enable all feature flags for opened project
                            features = "all",
                        },
                    },
                },
            },
            -- DAP configuration
            dap = {},
        }
    end,
}
