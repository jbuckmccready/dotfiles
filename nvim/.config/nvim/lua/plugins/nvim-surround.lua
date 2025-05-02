-- Surround selections, add quotes, etc.
return {
    {
        "kylechui/nvim-surround",
        event = "VeryLazy",
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
