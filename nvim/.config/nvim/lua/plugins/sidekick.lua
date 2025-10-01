return {
    "folke/sidekick.nvim",
    event = "VeryLazy",
    keys = {
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
    },
    opts = {
        -- using defaults
    },
}
