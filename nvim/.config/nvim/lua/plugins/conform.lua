-- Formatting.
return {
    "stevearc/conform.nvim",
    event = "BufWritePre",
    opts = {
        notify_on_error = false,
        formatters_by_ft = {
            c = { name = "clangd", lsp_format = "prefer" },
            go = { "gofmt" },
            javascript = { "prettier", lsp_format = "fallback" },
            javascriptreact = { "prettier", lsp_format = "fallback" },
            json = { "prettier" },
            jsonc = { "prettier" },
            less = { "prettier" },
            lua = { "stylua" },
            -- disabled for now, waiting on bug to be fixed: https://github.com/prettier/prettier/issues/8004
            -- update: that bug was fixed but now there's always a newline inserted before lists which is annoying
            -- markdown = { "prettier" },
            rust = { lsp_format = "prefer" },
            scss = { "prettier" },
            svelte = { "prettier", lsp_format = "fallback" },
            sh = { "shfmt" },
            terraform = { lsp_format = "prefer" },
            ["terraform-vars"] = { lsp_format = "prefer" },
            typescript = { "prettier", lsp_format = "fallback" },
            typescriptreact = { "prettier", lsp_format = "fallback" },
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
