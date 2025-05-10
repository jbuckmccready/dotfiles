return {
    "zbirenbaum/copilot.lua",
    cmd = "Copilot",
    event = "InsertEnter",
    keys = {
        {
            "<leader>cp",
            function()
                require("copilot.panel").toggle()
            end,
            desc = "Copilot Suggestions Panel",
        },
    },
    config = function()
        require("copilot").setup({
            suggestion = {
                auto_trigger = true,
                keymap = {
                    next = "<C-f>",
                    accept = "<Tab>",
                    accept_word = "<S-Tab>",
                    accept_line = "<C-Space>",
                },
            },
            filetypes = {
                -- Enable some filetypes that default to disabled
                yaml = true,
                markdown = true,
                gitcommit = true,
                gitrebase = true,
            },
        })
    end,
}
