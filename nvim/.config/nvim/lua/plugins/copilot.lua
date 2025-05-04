return {
    "github/copilot.vim",
    lazy = false,
    init = function()
        vim.keymap.set("i", "<Right>", 'copilot#Accept("\\<CR>")', {
            expr = true,
            replace_keycodes = false,
        })
        vim.g.copilot_no_tab_map = true
    end,
    keys = {
        { "<leader>cp", "<cmd>Copilot panel<CR>", desc = "Copilot Suggestions Panel" },
        { "<C-f>", "<Plug>(copilot-next)", mode = "i", desc = "Next Copilot Suggestion" },
    },
}
