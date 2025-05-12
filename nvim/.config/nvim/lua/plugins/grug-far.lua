-- Find and replace.
return {
    {
        "MagicDuck/grug-far.nvim",
        opts = {
            transient = true,
        },
        cmd = "GrugFar",
        keys = {
            {
                "<leader>vg",
                function()
                    local grug = require("grug-far")
                    grug.open()
                end,
                desc = "GrugFar",
                mode = { "n", "v" },
            },
            {
                "<leader>vG",
                function()
                    local grug = require("grug-far")
                    grug.open({ visualSelectionUsage = "operate-within-range" })
                end,
                desc = "GrugFarWithin",
                mode = { "v" },
            },
            {
                "<leader>vG",
                function()
                    local grug = require("grug-far")
                    grug.open({ prefills = { paths = vim.fn.expand("%") } })
                end,
                desc = "GrugFar Search Buffer",
                mode = { "n" },
            },
        },
    },
}
