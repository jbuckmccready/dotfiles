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
    },
    opts = {
        display = {
            action_palette = {
                provider = "default",
            },
        },
        strategies = {
            chat = {
                adapter = "copilot_chat",
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
                adapter = "copilot",
            },
        },
        adapters = {
            -- Define the custom adapter instance for chat so we can have different default model
            copilot_chat = function()
                return require("codecompanion.adapters").extend("copilot", {
                    name = "copilot_chat",
                    schema = {
                        model = {
                            default = "gemini-2.5-pro",
                        },
                    },
                })
            end,
            copilot = function()
                return require("codecompanion.adapters").extend("copilot", {
                    schema = {
                        model = {
                            default = "gemini-2.5-pro",
                        },
                    },
                })
            end,
            gemini = function()
                return require("codecompanion.adapters").extend("gemini", {
                    env = {
                        api_key = "cmd:cat ~/.config/.gemini-api-key",
                    },
                    schema = {
                        model = {
                            default = "gemini-2.5-flash-preview-04-17",
                        },
                    },
                })
            end,
        },
    },
}
