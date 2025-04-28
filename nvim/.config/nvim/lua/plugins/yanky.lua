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
            desc = "Putyankedtextaftercursor",
        },
        {
            "P",
            "<Plug>(YankyPutBefore)",
            mode = { "n", "x" },
            desc = "Putyankedtextbeforecursor",
        },
        { "=p", "<Plug>(YankyPutAfterLinewise)", desc = "Putyankedtextinlinebelow" },
        { "=P", "<Plug>(YankyPutBeforeLinewise)", desc = "Putyankedtextinlineabove" },
        { "<c-n>", "<Plug>(YankyCycleForward)", desc = "Cycleforwardthroughyankhistory" },
        { "<c-p>", "<Plug>(YankyCycleBackward)", desc = "Cyclebackwardthroughyankhistory" },
        { "y", "<Plug>(YankyYank)", mode = { "n", "x" }, desc = "Yankyyank" },
    },
}
