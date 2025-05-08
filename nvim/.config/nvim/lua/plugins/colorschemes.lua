return {
    {
        "catppuccin/nvim",
        name = "catppuccin",
        priority = 1000,
        lazy = false,
        opts = {
            integrations = {
                blink_cmp = true,
                diffview = true,
                copilot_vim = true,
                mason = true,
                nvim_surround = true,
                snacks = {
                    enabled = true,
                    indent_scope_color = "overlay1",
                },
            },
        },
    },
}
