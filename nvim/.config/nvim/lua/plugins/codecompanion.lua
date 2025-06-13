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
                require("codecompanion").prompt("quick_inline")
            end,
            mode = { "n", "x" },
            desc = "Quick Inline",
        },
    },
    opts = {
        display = {
            action_palette = {
                provider = "default",
            },
        },
        prompt_library = {
            ["Quick Inline"] = {
                strategy = "inline",
                description = "Quick inline interaction",
                opts = {
                    user_prompt = true,
                    short_name = "quick_inline",
                    adapter = {
                        name = "gemini",
                        model = "gemini-2.5-flash-preview-05-20",
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
