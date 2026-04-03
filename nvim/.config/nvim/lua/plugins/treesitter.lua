return {
    "nvim-treesitter/nvim-treesitter",
    dependencies = { { "nvim-treesitter/nvim-treesitter-textobjects", branch = "main" } },
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
            "tsx",
            "typescript",
            "vim",
            "vimdoc",
            "yaml",
            "zig",
        }

        vim.defer_fn(function()
            require("nvim-treesitter").install(parsers_installed)
        end, 1000)

        -- auto-start highlights
        vim.api.nvim_create_autocmd("FileType", {
            desc = "User: enable treesitter highlighting",
            callback = function()
                -- errors for filetypes with no parser
                pcall(vim.treesitter.start)
            end,
        })
    end,
}
