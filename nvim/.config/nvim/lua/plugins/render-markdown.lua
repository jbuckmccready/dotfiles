return {
    "MeanderingProgrammer/render-markdown.nvim",
    opts = {
        sign = {
            enabled = false,
        },
        heading = {
            icons = { "󰎤 ", "󰎧 ", "󰎪 ", "󰎭 ", "󰎱 ", "󰎳 " },
        },
        bullet = {
            icons = { "◉", "○", "◆", "◇" },
        },
        checkbox = {
            -- Turn on / off checkbox state rendering
            enabled = true,
            unchecked = {
                -- Replaces '[ ]' of 'task_list_marker_unchecked'
                icon = "   󰄱 ",
                -- Highlight for the unchecked icon
                highlight = "RenderMarkdownUnchecked",
                -- Highlight for item associated with unchecked checkbox
                scope_highlight = nil,
            },
            checked = {
                -- Replaces '[x]' of 'task_list_marker_checked'
                icon = "   󰱒 ",
                -- Highlight for the checked icon
                highlight = "RenderMarkdownChecked",
                -- Highlight for item associated with checked checkbox
                scope_highlight = nil,
            },
            -- Define custom checkbox states, more involved, not part of the markdown grammar.
            -- As a result this requires neovim >= 0.10.0 since it relies on 'inline' extmarks.
            -- The key is for healthcheck and to allow users to change its values, value type below.
            -- | raw             | matched against the raw text of a 'shortcut_link'           |
            -- | rendered        | replaces the 'raw' value when rendering                     |
            -- | highlight       | highlight for the 'rendered' icon                           |
            -- | scope_highlight | optional highlight for item associated with custom checkbox |
            custom = {
                todo = {
                    raw = "[-]",
                    rendered = "   󰥔 ",
                    highlight = "RenderMarkdownTodo",
                    scope_highlight = nil,
                },
            },
        },
    },
    ft = { "markdown", "codecompanion" },
    -- dependencies = { 'nvim-treesitter/nvim-treesitter', 'echasnovski/mini.nvim' }, -- if you use the mini.nvim suite
    -- dependencies = { 'nvim-treesitter/nvim-treesitter', 'echasnovski/mini.icons' }, -- if you use standalone mini plugins
    dependencies = { "nvim-treesitter/nvim-treesitter", "nvim-tree/nvim-web-devicons" }, -- if you prefer nvim-web-devicons
}
