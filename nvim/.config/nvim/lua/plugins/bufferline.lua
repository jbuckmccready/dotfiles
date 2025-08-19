-- Pretty bufferline.
return {
    "akinsho/bufferline.nvim",
    -- Avoid lazy loading as the UI layout change/flicker is distracting.
    lazy = false,
    after = "catppuccin",
    opts = {
        options = {
            show_close_icon = false,
            show_buffer_close_icons = false,
            hover = { enabled = false },
            truncate_names = false,
            indicator = { style = "underline" },
            close_command = function(bufnr)
                require("snacks").bufdelete(bufnr)
            end,
            diagnostics = "nvim_lsp",
            diagnostics_indicator = function(_, _, diag)
                local icons = require("icons").diagnostics
                local indicator = (diag.error and icons.ERROR .. " " or "") .. (diag.warning and icons.WARN or "")
                return vim.trim(indicator)
            end,
            offsets = {
                {
                    -- avoid rendering buffer line above snacks file explorer
                    filetype = "snacks_layout_box",
                },
            },
        },
    },
    keys = {
        -- Buffer navigation.
        { "<leader>bs", "<cmd>BufferLinePick<cr>", desc = "Pick a buffer to open" },
        {
            "<leader>bd",
            function()
                require("snacks").bufdelete()
            end,
            desc = "Delete current buffer",
        },
        { "<leader>bc", "<cmd>BufferLinePickClose<cr>", desc = "Select a buffer to close" },
        { "<leader>bl", "<cmd>BufferLineCloseLeft<cr>", desc = "Close buffers to the left" },
        { "<leader>br", "<cmd>BufferLineCloseRight<cr>", desc = "Close buffers to the right" },
        { "<leader>bo", "<cmd>BufferLineCloseOthers<cr>", desc = "Close other buffers" },
    },
    config = function(_, opts)
        opts.highlights = require("catppuccin.groups.integrations.bufferline").get_theme()
        require("bufferline").setup(opts)
    end,
}
