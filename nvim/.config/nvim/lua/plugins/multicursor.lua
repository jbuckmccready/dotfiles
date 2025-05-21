return {
    "jake-stewart/multicursor.nvim",
    branch = "1.0",
    config = function()
        local mc = require("multicursor-nvim")
        mc.setup()

        local set = vim.keymap.set

        -- Add or skip cursor above/below the main cursor.
        set({ "n", "x" }, "<up>", function()
            mc.lineAddCursor(-1)
        end, { desc = "Add cursor above" })
        set({ "n", "x" }, "<down>", function()
            mc.lineAddCursor(1)
        end, { desc = "Add cursor below" })
        set({ "n", "x" }, "<leader><up>", function()
            mc.lineSkipCursor(-1)
        end, { desc = "Skip cursor above" })
        set({ "n", "x" }, "<leader><down>", function()
            mc.lineSkipCursor(1)
        end, { desc = "Skip cursor below" })

        -- Add or skip adding a new cursor by matching word/selection
        set({ "n", "x" }, "<leader>mn", function()
            mc.matchAddCursor(1)
        end, { desc = "Add cursor by matching word/selection (forward)" })
        set({ "n", "x" }, "<leader>ms", function()
            mc.matchSkipCursor(1)
        end, { desc = "Skip adding cursor by matching word/selection (forward)" })
        set({ "n", "x" }, "<leader>mN", function()
            mc.matchAddCursor(-1)
        end, { desc = "Add cursor by matching word/selection (backward)" })
        set({ "n", "x" }, "<leader>mS", function()
            mc.matchSkipCursor(-1)
        end, { desc = "Skip adding cursor by matching word/selection (backward)" })

        -- Split visual selections by regex.
        set("x", "S", mc.splitCursors, { desc = "Split visual selections by regex" })

        -- match new cursors within visual selections by regex.
        set("x", "M", mc.matchCursors, { desc = "Match new cursors within visual selections by regex" })

        -- Add cursors to all matches of the current word/search.
        set({ "n", "v" }, "<leader>ma", mc.matchAllAddCursors, { desc = "Add cursor to all matches under cursor" })
        set("n", "<leader>mA", mc.searchAllAddCursors, { desc = "Add cursor to all search results in buffer" })

        -- Jump to first/last cursor.
        set({ "n", "v" }, "<leader>mH", mc.firstCursor, { desc = "Select first cursor" })
        set({ "n", "v" }, "<leader>mL", mc.lastCursor, { desc = "Select last cursor" })

        set("v", "<leader>mh", function()
            mc.swapCursors(-1)
        end, { desc = "Swap cursors left" })
        set("v", "<leader>ml", function()
            mc.swapCursors(1)
        end, { desc = "Swap cursors right" })

        set("v", "<leader>mt", function()
            mc.transposeCursors(1)
        end, { desc = "Rotate cursors clockwise" })
        set("v", "<leader>mT", function()
            mc.transposeCursors(-1)
        end, { desc = "Rotate cursors anti-clockwise" })

        -- Append/insert for each line of visual selections.
        -- Similar to block selection insertion.
        set("x", "I", mc.insertVisual, { desc = "Insert at the start of each line in visual selection" })
        set("x", "A", mc.appendVisual, { desc = "Append at the end of each line in visual selection" })

        -- bring back cursors if you accidentally clear them
        set("n", "<leader>mR", mc.restoreCursors, { desc = "Restore previous cursors" })

        -- Add and remove cursors with control + left click.
        set("n", "<c-leftmouse>", mc.handleMouse, { desc = "Add/remove cursor with left click" })
        set("n", "<c-leftdrag>", mc.handleMouseDrag, { desc = "Add/remove cursors with left drag" })
        set("n", "<c-leftrelease>", mc.handleMouseRelease, { desc = "Finalize mouse cursor selection" })

        -- Disable and enable cursors.
        set({ "n", "x" }, "<c-q>", mc.toggleCursor, { desc = "Toggle cursors" })

        -- Mappings defined in a keymap layer only apply when there are
        -- multiple cursors. This lets you have overlapping mappings.
        mc.addKeymapLayer(function(layerSet)
            -- Select a different cursor as the main one.
            layerSet({ "n", "x" }, "<left>", mc.prevCursor, { desc = "Select previous cursor as main" })
            layerSet({ "n", "x" }, "<right>", mc.nextCursor, { desc = "Select next cursor as main" })

            -- Add or skip adding a new cursor by matching word/selection
            layerSet({ "n", "x" }, "n", function()
                mc.matchAddCursor(1)
            end, { desc = "Add cursor by matching word/selection (forward)" })
            layerSet({ "n", "x" }, "N", function()
                mc.matchAddCursor(-1)
            end, { desc = "Add cursor by matching word/selection (backward)" })

            -- Delete the main cursor.
            layerSet({ "n", "x" }, "<leader>mx", mc.deleteCursor, { desc = "Delete main cursor" })

            -- Enable and clear cursors using escape.
            layerSet("n", "<esc>", function()
                if not mc.cursorsEnabled() then
                    mc.enableCursors()
                else
                    mc.clearCursors()
                end
            end, { desc = "Enable/clear cursors" })
        end)

        -- Customize how cursors look.
        local hl = vim.api.nvim_set_hl
        hl(0, "MultiCursorCursor", { reverse = true })
        hl(0, "MultiCursorVisual", { link = "Visual" })
        hl(0, "MultiCursorSign", { link = "SignColumn" })
        hl(0, "MultiCursorMatchPreview", { link = "Search" })
        hl(0, "MultiCursorDisabledCursor", { reverse = true })
        hl(0, "MultiCursorDisabledVisual", { link = "Visual" })
        hl(0, "MultiCursorDisabledSign", { link = "SignColumn" })
    end,
}
