-- Surround selections, add quotes, etc.
return {
    {
        "kylechui/nvim-surround",
        init = function()
            -- Disable all default keymaps; we remap s -> z (using s for flash)
            vim.g.nvim_surround_no_mappings = true
        end,
        keys = {
            { "yz", "<Plug>(nvim-surround-normal)", mode = "n", desc = "Surround" },
            { "yzz", "<Plug>(nvim-surround-normal-cur)", mode = "n", desc = "Surround (cur)" },
            { "yZ", "<Plug>(nvim-surround-normal-line)", mode = "n", desc = "Surround (line)" },
            { "yZZ", "<Plug>(nvim-surround-normal-cur-line)", mode = "n", desc = "Surround (cur line)" },
            { "Z", "<Plug>(nvim-surround-visual)", mode = "v", desc = "Surround (visual)" },
            { "dz", "<Plug>(nvim-surround-delete)", mode = "n", desc = "Delete surround" },
            { "cz", "<Plug>(nvim-surround-change)", mode = "n", desc = "Change surround" },
        },
    },
}
