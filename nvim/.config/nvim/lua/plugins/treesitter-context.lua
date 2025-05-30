return {
    "nvim-treesitter/nvim-treesitter-context",
    keys = {
        { "<leader>ut", "<cmd>TSContext toggle<cr>", desc = "Toggle Treesitter Context" },
    },
    opts = {
        enable = false, -- Disabled initially so when we run toggle to lazy load it will be enabled
        multiwindow = false, -- Enable multiwindow support.
        max_lines = 4, -- How many lines the window should span. Values <= 0 mean no limit.
        min_window_height = 30, -- Minimum editor window height to enable context. Values <= 0 mean no limit.
        line_numbers = true,
        multiline_threshold = 1, -- Maximum number of lines to show for a single context
        trim_scope = "inner", -- Which context lines to discard if `max_lines` is exceeded. Choices: 'inner', 'outer'
        mode = "cursor", -- Line used to calculate context. Choices: 'cursor', 'topline'
        -- Separator between context and content. Should be a single character string, like '-'.
        -- When separator is set, the context will only show up when there are at least 2 lines above cursorline.
        separator = nil,
        zindex = 20, -- The Z-index of the context window
        on_attach = nil, -- (fun(buf: integer): boolean) return false to disable attaching
    },
}
