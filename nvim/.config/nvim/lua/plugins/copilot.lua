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
                -- Add codecompanion filetype
                codecompanion = true,
            },
            -- override default should_attach function for codecompanion
            should_attach = function(_, _)
                -- override to always attach to codecompanion (despite vim.bo.buflisted == false)
                if vim.bo.filetype == "codecompanion" then
                    return true
                end

                if not vim.bo.buflisted then
                    return false
                end

                if vim.bo.buftype ~= "" then
                    return false
                end

                return true
            end,
        })
    end,
}
