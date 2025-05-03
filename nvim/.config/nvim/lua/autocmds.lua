-- Resume at last location when opening a buffer
vim.api.nvim_create_autocmd("BufReadPost", {
    desc = "Go to the last location when opening a buffer",
    callback = function(args)
        local mark = vim.api.nvim_buf_get_mark(args.buf, '"')
        local line_count = vim.api.nvim_buf_line_count(args.buf)
        if mark[1] > 0 and mark[1] <= line_count then
            vim.cmd('normal! g`"zz')
        end
    end,
})

-- Making scroffoff work at end of file
-- Copied, simplified, and adjusted from here: https://github.com/Aasim-A/scrollEOF.nvim
vim.api.nvim_create_autocmd({ "CursorMoved", "WinScrolled" }, {
    group = vim.api.nvim_create_augroup("ScrollEOF", { clear = true }),
    desc = "Scrolloff functionality at EOF",
    callback = function(ev)
        -- do not apply to minifiles, causes flickering/jumping issues
        if vim.bo.filetype == "minifiles" then
            return
        end
        if ev.event == "WinScrolled" then
            local win_id = vim.api.nvim_get_current_win()
            local win_event = vim.v.event[tostring(win_id)]
            if win_event ~= nil and win_event.topline <= 0 then
                return
            end
        end

        local win_height = vim.fn.winheight(0)
        local win_cur_line = vim.fn.winline()
        local scrolloff = math.min(vim.o.scrolloff, math.floor(win_height / 2))
        local visual_distance_to_eof = win_height - win_cur_line

        if visual_distance_to_eof < scrolloff then
            if vim.o.scrolloff >= win_height / 2 then
                vim.cmd("normal! zz")
                return
            end
            local win_view = vim.fn.winsaveview()
            vim.fn.winrestview({
                skipcol = 0, -- Without this, `gg` `G` can cause the cursor position to be shown incorrectly
                topline = win_view.topline + scrolloff - visual_distance_to_eof,
            })
        end
    end,
})

-- Prefer LSP folding if client supports it
vim.api.nvim_create_autocmd("LspAttach", {
    callback = function(args)
        local client = vim.lsp.get_client_by_id(args.data.client_id)
        if client == nil then
            return
        end
        if client:supports_method("textDocument/foldingRange") then
            local win = vim.api.nvim_get_current_win()
            vim.wo[win][0].foldexpr = "v:lua.vim.lsp.foldexpr()"
        end
    end,
})
