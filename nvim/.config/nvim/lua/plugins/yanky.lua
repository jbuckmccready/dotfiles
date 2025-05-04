-- Better copy/pasting.
return {
    "gbprod/yanky.nvim",
    opts = function()
        -- Set highlight groups for yanky (it uses its own)
        vim.api.nvim_set_hl(0, "YankyPut", { link = "IncSearch" })
        vim.api.nvim_set_hl(0, "YankyYanked", { link = "IncSearch" })
        return {
            ring = { history_length = 20 },
            highlight = { timer = 150 },
        }
    end,
    keys = {
        -- Copy/paste with system clipboard, NOTE: keymaps are here so yanky gets loaded for highlighting etc.
        {
            "<leader>y",
            '"+y',
            mode = { "n", "x" },
            desc = "Copy to system clipboard",
        },
        {
            "<leader>p",
            '"+p',
            mode = { "n" },
            desc = "Paste from system clipboard",
        },
        -- Paste in Visual with `P` to not copy selected text (`:h v_P`)
        {
            "<leader>p",
            '"+P',
            mode = { "x" },
            desc = "Paste from system clipboard",
        },
        {
            "p",
            "<Plug>(YankyPutAfter)",
            mode = { "n", "x" },
            desc = "Put yanked text after cursor",
        },
        {
            "P",
            "<Plug>(YankyPutBefore)",
            mode = { "n", "x" },
            desc = "Put yanked text before cursor",
        },
        { "=p", "<Plug>(YankyPutAfterLinewise)", desc = "Put yanked text in line below" },
        { "=P", "<Plug>(YankyPutBeforeLinewise)", desc = "Put yanked text in line above" },
        { "[y", "<Plug>(YankyCycleForward)", desc = "Cycle forward through yank history" },
        { "]y", "<Plug>(YankyCycleBackward)", desc = "Cycle backward through yank history" },
        { "y", "<Plug>(YankyYank)", mode = { "n", "x" }, desc = "Yanky yank" },
    },
}
