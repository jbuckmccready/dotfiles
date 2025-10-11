return {
    "folke/sidekick.nvim",
    event = "VeryLazy",
    keys = {
        {
            "<leader>at",
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
            "<leader>as",
            function()
                require("sidekick.cli").send({ msg = "{this}" })
            end,
            mode = { "x", "n" },
            desc = "Send This",
        },
        {
            "<leader>ag",
            function()
                require("sidekick.cli").send({ msg = "{selection}" })
            end,
            mode = { "x" },
            desc = "Send Visual Selection",
        },
        {
            "<leader>af",
            function()
                require("sidekick.cli").send({ msg = "{file}" })
            end,
            desc = "Send File",
        },
        {
            "<leader>ab",
            function()
                require("sidekick.cli").send({ msg = "{buffers}" })
            end,
            desc = "Send Buffers",
        },
        {
            "<leader>aa",
            function()
                require("sidekick.cli").select({ filter = { installed = true } })
            end,
            desc = "Toggle AI CLI",
            mode = { "n", "v" },
        },
        {
            "<leader>ad",
            function()
                require("sidekick.cli").close()
            end,
            desc = "Detach a CLI Session",
        },
        {
            "<leader>ac",
            function()
                require("sidekick.cli").toggle({ name = "claude", focus = true })
            end,
            desc = "Toggle Claude CLI",
            mode = { "n", "v" },
        },
        {
            "<leader>ap",
            function()
                require("sidekick.cli").prompt()
            end,
            desc = "Select AI Prompt",
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
