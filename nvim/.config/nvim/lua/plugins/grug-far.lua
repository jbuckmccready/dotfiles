-- Find and replace.
return {
    {
        "MagicDuck/grug-far.nvim",
        opts = {},
        cmd = "GrugFar",
        keys = {
            {
                "<leader>vg",
                function()
                    local grug = require("grug-far")
                    grug.open({ transient = true })
                end,
                desc = "GrugFar",
                mode = { "n", "v" },
            },
        },
    },
}
