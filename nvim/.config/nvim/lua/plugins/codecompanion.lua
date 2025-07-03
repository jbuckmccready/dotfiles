return {
    "olimorris/codecompanion.nvim",
    dependencies = {
        "nvim-lua/plenary.nvim",
        "nvim-treesitter/nvim-treesitter",
    },
    keys = {
        { "<leader>cc", "<cmd>CodeCompanionChat Toggle<CR>", mode = { "n" }, desc = "Code Companion Chat" },
        { "<leader>cA", "<cmd>CodeCompanionActions<CR>", mode = { "n", "x" }, desc = "Actions" },
        { "<leader>ca", "<cmd>CodeCompanionChat Add<CR>", desc = "Add to CodeCompanion chat", mode = "x" },
        {
            "<leader>ci",
            function()
                if vim.fn.mode() == "n" then
                    vim.api.nvim_command("CodeCompanion")
                else
                    vim.api.nvim_command("'<,'>CodeCompanion")
                end
            end,
            mode = { "n", "x" },
            desc = "Inline",
        },
        {
            "<leader>cI",
            function()
                require("codecompanion").prompt("flash_inline")
            end,
            mode = { "n", "x" },
            desc = "Flash Inline",
        },
    },
    opts = {
        display = {
            action_palette = {
                provider = "default",
            },
        },
        prompt_library = {
            ["Flash Inline"] = {
                strategy = "inline",
                description = "Flash inline interaction",
                opts = {
                    user_prompt = true,
                    short_name = "flash_inline",
                    adapter = {
                        name = "gemini",
                        model = "gemini-2.5-flash",
                    },
                },
            },
        },
        strategies = {
            chat = {
                adapter = {
                    name = "copilot",
                    model = "gemini-2.5-pro",
                },
                keymaps = {
                    send = {
                        modes = { n = "<C-s>", i = "<C-s>" },
                        callback = function()
                            -- exit insert mode (similar to when using C-s to save and exit insert mode)
                            vim.cmd("stopinsert")
                            require("codecompanion").last_chat():submit()
                        end,
                    },
                },
            },
            inline = {
                adapter = {
                    name = "copilot",
                    model = "gpt-4.1",
                },
            },
        },
        adapters = {
            gemini = function()
                return require("codecompanion.adapters").extend("gemini", {
                    env = {
                        api_key = "cmd:cat ~/.config/.gemini-api-key",
                    },
                })
            end,
        },
    },
}
