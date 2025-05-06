return {
    "NeogitOrg/neogit",
    dependencies = {
        "nvim-lua/plenary.nvim",
        "sindrets/diffview.nvim",
        "folke/snacks.nvim",
    },
    keys = {
        { "<leader>gN", "<cmd>Neogit<CR>", mode = "n", desc = "Neogit" },
    },
    opts = {
        -- prettier log graph
        graph_style = "kitty",
        -- disable ctrl-c mappings
        mappings = {
            commit_editor = {
                ["<c-c><c-c>"] = false,
                ["<c-c><c-k>"] = false,
            },
            commit_editor_I = {
                ["<c-c><c-c>"] = false,
                ["<c-c><c-k>"] = false,
            },
            rebase_editor = {
                ["<c-c><c-c>"] = false,
                ["<c-c><c-k>"] = false,
            },
            rebase_editor_I = {
                ["<c-c><c-c>"] = false,
                ["<c-c><c-k>"] = false,
            },
        },
    },
}
