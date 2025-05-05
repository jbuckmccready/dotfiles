return {
    "github/copilot.vim",
    lazy = false,
    keys = {
        { "<leader>cp", "<cmd>Copilot panel<CR>", desc = "Copilot Suggestions Panel" },
        { "<C-f>", "<Plug>(copilot-next)", mode = "i", desc = "Next Copilot Suggestion" },
    },
}
