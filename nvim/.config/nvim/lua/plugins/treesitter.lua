return {
    "nvim-treesitter/nvim-treesitter",
    branch = "main",
    lazy = false,
    build = ":TSUpdate",
    init = function()
        local parsers_installed = {
            "bash",
            "c",
            "cpp",
            "diff",
            "go",
            "html",
            "javascript",
            "json",
            "lua",
            "luadoc",
            "markdown",
            "markdown_inline",
            "python",
            "rust",
            "sql",
            "terraform",
            "vim",
            "vimdoc",
            "yaml",
            "zig",
        }

        vim.defer_fn(function()
            require("nvim-treesitter").install(parsers_installed)
        end, 1000)
        require("nvim-treesitter").update()

        -- auto-start highlights & indentation
        vim.api.nvim_create_autocmd("FileType", {
            desc = "User: enable treesitter highlighting",
            callback = function(ctx)
                -- start treesitter for highlights
                -- errors for filetypes with no parser
                local has_started = pcall(vim.treesitter.start)

                -- indent
                local no_indent = {}
                if has_started and not vim.list_contains(no_indent, ctx.match) then
                    vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
                end
            end,
        })
    end,
}
