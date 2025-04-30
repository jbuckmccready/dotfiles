return {
    "jakewvincent/mkdnflow.nvim",
    ft = "markdown",
    opts = function()
        -- NOTE: setting keymaps here instead of in the plugin mappings so we get miniclue descriptions
        -- Only enable MkdnEnter for normal and visual modes, insert mode causes issues with blink-cmp, using bullets.vim instead
        vim.keymap.set({ "n", "v" }, "<CR>", "<Cmd>MkdnEnter<CR>", { desc = "mkdnflow MkdnEnter" })
        vim.keymap.set({ "n" }, "<Tab>", "<Cmd>MkdnNextLink<CR>", { desc = "Jump to next md link" })
        vim.keymap.set({ "n" }, "<S-Tab>", "<Cmd>MkdnPrevLink<CR>", { desc = "Jump to prev md link" })
        vim.keymap.set(
            { "n", "v" },
            "<leader>mp",
            "<Cmd>MkdnCreateLinkFromClipboard<CR>",
            { desc = "Paste clipboard as link" }
        )
        vim.keymap.set({ "n" }, "<leader>my", "<Cmd>MkdnYankAnchorLink<CR>", { desc = "Yank header anchor link" })
        vim.keymap.set({ "n", "v" }, "<C-Space>", "<Cmd>MkdnToggleToDo<CR>", { desc = "Toggle todo" })
        vim.keymap.set(
            { "n" },
            "<leader>mr",
            "<Cmd>MkdnTableNewRowBelow<CR>",
            { desc = "mkdnflow MkdnTableNewRowBelow" }
        )
        vim.keymap.set(
            { "n" },
            "<leader>mR",
            "<Cmd>MkdnTableNewRowAbove<CR>",
            { desc = "mkdnflow MkdnTableNewRowAbove" }
        )
        vim.keymap.set(
            { "n" },
            "<leader>mc",
            "<Cmd>MkdnTableNewColAfter<CR>",
            { desc = "mkdnflow MkdnTableNewColAfter" }
        )
        vim.keymap.set(
            { "n" },
            "<leader>mC",
            "<Cmd>MkdnTableNewColBefore<CR>",
            { desc = "mkdnflow MkdnTableNewColBefore" }
        )

        return {
            modules = {
                bib = false,
                buffers = false,
                conceal = true,
                cursor = true,
                folds = false,
                links = true,
                lists = true,
                maps = true,
                paths = true,
                tables = true,
                yaml = false,
                cmp = false,
            },
            perspective = {
                priority = "current",
                fallback = "current",
                root_tell = false,
                nvim_wd_heel = false,
                update = false,
            },
            mappings = {
                -- Disable all default mappings, set via `vim.keymap.set` so we get descriptions in miniclue
                MkdnEnter = false,
                MkdnTab = false,
                MkdnSTab = false,
                MkdnNextLink = false,
                MkdnPrevLink = false,
                MkdnNextHeading = false,
                MkdnPrevHeading = false,
                MkdnGoBack = false,
                MkdnGoForward = false,
                MkdnCreateLink = false,
                MkdnCreateLinkFromClipboard = false,
                MkdnFollowLink = false,
                MkdnDestroyLink = false,
                MkdnTagSpan = false,
                MkdnMoveSource = false,
                MkdnYankAnchorLink = false,
                MkdnYankFileAnchorLink = false,
                MkdnIncreaseHeading = false,
                MkdnDecreaseHeading = false,
                MkdnToggleToDo = false,
                MkdnNewListItem = false,
                MkdnNewListItemBelowInsert = false,
                MkdnNewListItemAboveInsert = false,
                MkdnExtendList = false,
                MkdnUpdateNumbering = false,
                MkdnTableNextCell = false,
                MkdnTablePrevCell = false,
                MkdnTableNextRow = false,
                MkdnTablePrevRow = false,
                MkdnTableNewRowBelow = false,
                MkdnTableNewRowAbove = false,
                MkdnTableNewColAfter = false,
                MkdnTableNewColBefore = false,
                MkdnFoldSection = false,
                MkdnUnfoldSection = false,
            },
        }
    end,
}
