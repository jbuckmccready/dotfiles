-- Surround selections, add quotes, etc.
return {
    {
        "kylechui/nvim-surround",
        keys = {
            -- lazy load only when keys are used
            { "yz", mode = { "n" }, desc = "Surround" },
            { "yzz", mode = { "n" }, desc = "Surround (cur)" },
            { "yZ", mode = { "n" }, desc = "Surround (line)" },
            { "yZZ", mode = { "n" }, desc = "Surround (cur line)" },
            { "Z", mode = { "v" }, desc = "Surround (visual)" },
            { "dz", mode = { "n" }, desc = "Delete surround" },
            { "cz", mode = { "n" }, desc = "Change surround" },
        },
        opts = {
            keymaps = {
                insert = false,
                insert_line = false,
                visual_line = false,
                -- remap s -> z, using s for flash and I don't use z for editing folds
                normal = "yz",
                normal_cur = "yzz",
                normal_line = "yZ",
                normal_cur_line = "yZZ",
                visual = "Z",
                delete = "dz",
                change = "cz",
            },
        },
    },
}
