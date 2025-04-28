-- Toggle floating terminal, code copied from https://github.com/MariaSolOs/dotfiles/blob/main/.config/nvim/lua/float_term.lua
local M = {}

---@type LazyFloat?
local terminal = nil

--- Opens an interactive floating terminal.
---@param cmd? string
---@param opts? LazyCmdOptions
function M.float_term(cmd, opts)
    opts = vim.tbl_deep_extend("force", {
        ft = "lazyterm",
        size = { width = 0.9, height = 0.9 },
        persistent = true,
    }, opts or {})

    if terminal and terminal:buf_valid() and vim.b[terminal.buf].lazyterm_cmd == cmd then
        terminal:toggle()
    else
        terminal = require("lazy.util").float_term(cmd, opts)
        vim.b[terminal.buf].lazyterm_cmd = cmd
    end
end

return M
