return {
    "nvim-treesitter/nvim-treesitter",
    event = { "BufReadPre", "BufNewFile" },
    build = ":TSUpdate",
    opts = {
        highlight = {
            enable = true,
        },
        ensure_installed = {
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
        },
        incremental_selection = {
            enable = true,
            keymaps = {
                init_selection = "<cr>",
                node_incremental = "<cr>",
                scope_incremental = false,
                node_decremental = "<bs>",
            },
        },
    },
    config = function(_, opts)
        require("nvim-treesitter.configs").setup(opts)
    end,
}
