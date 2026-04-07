return {
    "nvim-treesitter/nvim-treesitter",
    dependencies = { { "nvim-treesitter/nvim-treesitter-textobjects", branch = "main" } },
    branch = "main",
    lazy = false,
    build = ":TSUpdate",
    config = function()
        local parsers = {
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

        -- Install missing parsers on startup. Checks for actual .so files
        -- rather than relying on nvim-treesitter's get_installed(), which
        -- incorrectly considers a parser installed if only its query dir exists.
        local parser_dir = vim.fs.joinpath(vim.fn.stdpath("data"), "site", "parser")
        local missing = vim.tbl_filter(function(lang)
            return vim.fn.filereadable(vim.fs.joinpath(parser_dir, lang .. ".so")) == 0
        end, parsers)

        if #missing > 0 then
            require("nvim-treesitter.install").install(missing, { force = true })
        end

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
