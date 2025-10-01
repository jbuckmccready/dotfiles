return {
    "folke/sidekick.nvim",
    event = "VeryLazy",
    keys = {
        {
            "<leader>wt",
            function()
                require("sidekick.nes").toggle()
            end,
            desc = "Toggle Edit Suggestions",
        },
        {
            "<tab>",
            function()
                -- if there is a next edit, jump to it, otherwise apply it if any
                if not require("sidekick").nes_jump_or_apply() then
                    return "<Tab>" -- fallback to normal tab
                end
            end,
            expr = true,
            desc = "Goto/Apply Next Edit Suggestion",
        },
        {
            "<leader>wa",
            function()
                require("sidekick.cli").toggle({ focus = true })
            end,
            desc = "Toggle AI CLI",
            mode = { "n", "v" },
        },
        {
            "<leader>wc",
            function()
                require("sidekick.cli").toggle({ name = "claude", focus = true })
            end,
            desc = "Toggle Claude CLI",
            mode = { "n", "v" },
        },
        {
            "<leader>wp",
            function()
                require("sidekick.cli").prompt()
            end,
            desc = "Select AI Prompt",
            mode = { "n", "v" },
        },
        {
            "<leader>ws",
            function()
                require("sidekick.cli").ask({ location = true })
            end,
            desc = "Ask AI with context",
            mode = { "n", "v" },
        },
        {
            "<leader>we",
            function()
                require("sidekick.cli").ask({ prompt = "explain", location = true })
            end,
            desc = "Ask AI to explain this code",
            mode = { "n", "v" },
        },
    },
    opts = {
        cli = {
            watch = true, -- watch for file changes in CLI
            win = {
                layout = "right",
                split = {
                    width = 140,
                },
            },
            mux = {
                backend = "tmux",
                enabled = false,
            },
        },
    },
}
