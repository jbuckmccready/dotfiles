-- Formatting.
return {
    "stevearc/conform.nvim",
    event = "BufWritePre",
    opts = {
        notify_on_error = false,
        formatters_by_ft = {
            c = { name = "clangd", lsp_format = "prefer" },
            go = { "gofmt" },
            javascript = { "prettier", name = "dprint", lsp_format = "fallback" },
            javascriptreact = { "prettier", name = "dprint", lsp_format = "fallback" },
            json = { "prettier", stop_on_first = true, name = "dprint" },
            jsonc = { "prettier", stop_on_first = true, name = "dprint" },
            less = { "prettier" },
            lua = { "stylua" },
            -- disabled for now, waiting on bug to be fixed: https://github.com/prettier/prettier/issues/8004
            -- markdown = { "prettier" },
            rust = { lsp_format = "prefer" },
            scss = { "prettier" },
            sh = { "shfmt" },
            terraform = { lsp_format = "prefer" },
            ["terraform-vars"] = { lsp_format = "prefer" },
            typescript = { "prettier", name = "dprint", lsp_format = "fallback" },
            typescriptreact = { "prettier", name = "dprint", lsp_format = "fallback" },
            -- For filetypes without a formatter:
            ["_"] = { "trim_whitespace", "trim_newlines" },
        },
        format_on_save = function()
            -- Stop if we disabled auto-formatting.
            if not vim.g.autoformat then
                return nil
            end

            return { timeout_ms = 500 }
        end,
    },
    init = function()
        -- Use conform for gq.
        vim.o.formatexpr = "v:lua.require'conform'.formatexpr()"

        -- Start auto-formatting by default (can be toggled).
        vim.g.autoformat = true
    end,
}
