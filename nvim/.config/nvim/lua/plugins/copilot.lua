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
        {
            "<leader>up",
            function()
                local client = require("copilot.client")
                local command = require("copilot.command")
                if client.is_disabled() then
                    command.enable()
                    vim.notify("Enabling Copilot...", vim.log.levels.INFO)
                else
                    command.disable()
                    vim.notify("Disabling Copilot...", vim.log.levels.INFO)
                end
            end,
            desc = "Toggle Copilot",
        },
    },
    config = function()
        require("copilot").setup({
            server_opts_overrides = {
                settings = {
                    telemetry = {
                        telemetryLevel = "off",
                    },
                },
            },
            suggestion = {
                auto_trigger = true,
                keymap = {
                    next = "<C-f>",
                    -- Handled in sidekick plugin
                    accept = false,
                    accept_word = "<S-Tab>",
                    accept_line = "<C-Space>",
                },
            },
            filetypes = {
                -- Uncomment to disable all filetypes for offline mode
                -- ["*"] = false,
                -- Enable some filetypes that default to disabled
                yaml = true,
                markdown = true,
                gitcommit = true,
                gitrebase = true,
            },
            should_attach = function(_, _)
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
