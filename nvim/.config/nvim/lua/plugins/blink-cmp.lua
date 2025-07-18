-- Auto-completion:
return {
    "saghen/blink.cmp",
    build = "cargo +nightly build --release",
    dependencies = "LuaSnip",
    event = "InsertEnter",
    opts = {
        keymap = {
            ["<CR>"] = { "accept", "fallback" },
            ["<C-Space>"] = {},
            ["<C-n>"] = { "select_next", "show" },
            ["<C-p>"] = { "select_prev" },
            ["<Tab>"] = { "snippet_forward", "fallback" },
            ["<C-u>"] = { "scroll_documentation_up", "fallback" },
            ["<C-d>"] = { "scroll_documentation_down", "fallback" },
        },
        signature = { enabled = true },
        completion = {
            accept = {
                -- Write completions to the `.` register
                dot_repeat = true,
            },
            list = {
                selection = { preselect = false, auto_insert = true },
                -- Show more items than default 10 so it's easier to browse apis.
                max_items = 20,
            },
            documentation = {
                auto_show = true,
                window = {
                    border = "rounded",
                },
            },
        },
        snippets = { preset = "luasnip" },
        -- Disable command line completion
        cmdline = { enabled = false },
        sources = {
            -- Disable some sources in comments and strings.
            default = function()
                local sources = { "lsp", "buffer", "path" }
                local ok, node = pcall(vim.treesitter.get_node)

                if ok and node then
                    if node:type() ~= "string" then
                        table.insert(sources, "snippets")
                    end
                end

                return sources
            end,
            per_filetype = {
                -- add `dadbod` source for sql files
                sql = { "dadbod", "buffer" },
            },
            providers = {
                -- define `dadbod` provider
                dadbod = { name = "Dadbod", module = "vim_dadbod_completion.blink" },
            },
        },
        appearance = {
            kind_icons = require("icons").symbol_kinds,
        },
    },
    config = function(_, opts)
        require("blink.cmp").setup(opts)

        -- Set border color.
        vim.api.nvim_set_hl(0, "BlinkCmpDocBorder", { link = "FloatBorder" })

        -- Extend neovim's client capabilities with the completion ones.
        vim.lsp.config("*", { capabilities = require("blink.cmp").get_lsp_capabilities(nil, true) })
    end,
}
