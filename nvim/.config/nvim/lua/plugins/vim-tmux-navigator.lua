return {
    "christoomey/vim-tmux-navigator",
    lazy = false,
    config = function()
        vim.keymap.set({ "n", "v" }, "<C-h>", "<cmd>TmuxNavigateLeft<cr>", { desc = "Navigate left" })
        vim.keymap.set({ "n", "v" }, "<C-j>", "<cmd>TmuxNavigateDown<cr>", { desc = "Navigate down" })
        vim.keymap.set({ "n", "v" }, "<C-k>", "<cmd>TmuxNavigateUp<cr>", { desc = "Navigate up" })
        vim.keymap.set({ "n", "v" }, "<C-l>", "<cmd>TmuxNavigateRight<cr>", { desc = "Navigate right" })
        vim.keymap.set({ "n", "v" }, "<C-\\>", "<cmd>TmuxNavigatePrevious<cr>", { desc = "Navigate previous" })

        vim.keymap.set("t", "<C-h>", "<C-\\><C-N><cmd>TmuxNavigateLeft<cr>", { desc = "Navigate left (terminal mode)" })
        vim.keymap.set("t", "<C-j>", "<C-\\><C-N><cmd>TmuxNavigateDown<cr>", { desc = "Navigate down (terminal mode)" })
        vim.keymap.set("t", "<C-k>", "<C-\\><C-N><cmd>TmuxNavigateUp<cr>", { desc = "Navigate up (terminal mode)" })
        vim.keymap.set(
            "t",
            "<C-l>",
            "<C-\\><C-N><cmd>TmuxNavigateRight<cr>",
            { desc = "Navigate right (terminal mode)" }
        )
        vim.keymap.set(
            "t",
            "<C-\\>",
            "<C-\\><C-N><cmd>TmuxNavigatePrevious<cr>",
            { desc = "Navigate previous (terminal mode)" }
        )
    end,
}
