-- Keeping the cursor centered
vim.keymap.set("n", "<C-d>", "<C-d>zz", { desc = "Scroll downwards" })
vim.keymap.set("n", "<C-u>", "<C-u>zz", { desc = "Scroll upwards" })
vim.keymap.set("n", "n", "nzzzv", { desc = "Next result" })
vim.keymap.set("n", "N", "Nzzzv", { desc = "Previous result" })

-- jk autoscrolling
vim.keymap.set("n", "j", function()
    if vim.g.jk_auto_scroll then
        vim.cmd("normal! jzz")
    else
        vim.cmd("normal! j")
    end
end, { noremap = true, desc = "Cursor down" })
vim.keymap.set("n", "k", function()
    if vim.g.jk_auto_scroll then
        vim.cmd("normal! kzz")
    else
        vim.cmd("normal! k")
    end
end, { noremap = true, desc = "Cursor up" })

-- Indent while remaining in visual mode
vim.keymap.set("v", "<", "<gv")
vim.keymap.set("v", ">", ">gv")

-- <esc> also clear highlight search
vim.keymap.set({ "i", "s", "n" }, "<esc>", function()
    if require("luasnip").expand_or_jumpable() then
        require("luasnip").unlink_current()
    end
    vim.cmd("noh")
    return "<esc>"
end, { desc = "Escape, clear hlsearch, and stop snippet session", expr = true })

-- Reselect latest changed, put, or yanked text
vim.keymap.set(
    "n",
    "gV",
    '"`[" . strpart(getregtype(), 0, 1) . "`]"',
    { expr = true, replace_keycodes = false, desc = "Visually select changed text" }
)

-- Search inside visually highlighted text. Use `silent = false` for it to
-- make effect immediately.
vim.keymap.set("x", "g/", "<esc>/\\%V", { silent = false, desc = "Search inside visual selection" })

-- Alternative way to save and exit in Normal mode.
-- NOTE: Adding `redraw` helps with `cmdheight=0` if buffer is not modified
vim.keymap.set("n", "<C-S>", "<Cmd>silent! update | redraw<CR>", { desc = "Save" })
vim.keymap.set({ "i", "x" }, "<C-S>", "<Esc><Cmd>silent! update | redraw<CR>", { desc = "Save and go to Normal mode" })

-- Mode Toggles
vim.keymap.set({ "n" }, "\\l", "<Cmd>setlocal list! list?<CR>", { desc = "Toggle 'list'" })
vim.keymap.set(
    { "n" },
    "\\r",
    "<Cmd>setlocal relativenumber! relativenumber?<CR>",
    { desc = "Toggle 'relativenumber'" }
)
vim.keymap.set({ "n" }, "\\n", "<Cmd>setlocal number! number?<CR>", { desc = "Toggle 'number'" })
vim.keymap.set({ "n" }, "\\s", "<Cmd>setlocal spell! spell?<CR>", { desc = "Toggle 'spell'" })
vim.keymap.set({ "n" }, "\\i", "<Cmd>setlocal ignorecase! ignorecase?<CR>", { desc = "Toggle 'ignorecase'" })
vim.keymap.set({ "n" }, "\\c", "<Cmd>setlocal cursorline! cursorline?<CR>", { desc = "Toggle 'cursorline'" })
vim.keymap.set({ "n" }, "\\C", "<Cmd>setlocal cursorcolumn! cursorcolumn?<CR>", { desc = "Toggle 'cursorcolumn'" })
vim.keymap.set(
    { "n" },
    "\\h",
    "<Cmd>let v:hlsearch = 1 - v:hlsearch | echo (v:hlsearch ? '  ' : 'no') . 'hlsearch'<CR>",
    { desc = "Toggle 'hlsearch'" }
)
vim.keymap.set({ "n" }, "\\w", "<Cmd>setlocal wrap! wrap?<CR>", { desc = "Toggle 'wrap'" })

-- Toggle diagnostics
vim.keymap.set({ "n" }, "\\d", function()
    vim.diagnostic.enable(not vim.diagnostic.is_enabled())
    vim.notify(
        string.format("%s diagnostics...", vim.diagnostic.is_enabled() and "Enabling" or "Disabling"),
        vim.log.levels.INFO
    )
end, { desc = "Toggle diagnostic" })

-- Toggle virtual lines for diagnostics
vim.keymap.set({ "n" }, "\\D", function()
    if not vim.diagnostic.config().virtual_lines then
        vim.diagnostic.config({
            virtual_text = false,
            virtual_lines = { current_line = true },
        })
    else
        vim.diagnostic.config({
            virtual_text = { current_line = true },
            virtual_lines = false,
        })
    end

    vim.notify(
        string.format(
            "%s virtual lines for diagnostics...",
            vim.diagnostic.config().virtual_lines and "Enabling" or "Disabling"
        ),
        vim.log.levels.INFO
    )
end, { desc = "Toggle virtual lines diagnostics" })

-- Toggle autoformatting
vim.keymap.set({ "n" }, "\\f", function()
    vim.g.autoformat = not vim.g.autoformat
    vim.notify(string.format("%s formatting...", vim.g.autoformat and "Enabling" or "Disabling"), vim.log.levels.INFO)
end, { desc = "Toggle formatting" })

-- Toggle jk auto scrolling
vim.keymap.set({ "n" }, "\\j", function()
    vim.g.jk_auto_scroll = not vim.g.jk_auto_scroll
    vim.notify(
        string.format("%s auto scrolling with jk...", vim.g.jk_auto_scroll and "Enabling" or "Disabling"),
        vim.log.levels.INFO
    )
end, { desc = "Toggle auto scrolling with jk" })

-- Toggle ignore white space for diffs
vim.keymap.set({ "n" }, "<leader>gi", function()
    local is_ignoring_ws = vim.tbl_contains(vim.opt.diffopt:get(), "iwhite")

    if is_ignoring_ws then
        vim.opt.diffopt:remove("iwhite")
        is_ignoring_ws = false
    else
        vim.opt.diffopt:append("iwhite")
        is_ignoring_ws = true
    end

    vim.notify(
        string.format("%s diff ignore white space...", is_ignoring_ws and "Enabling" or "Disabling"),
        vim.log.levels.INFO
    )
end, { desc = "Toggle diff ignore white space" })

-- Copy shared main ancestor commit sha to clipboard, useful for diffing branches with main without having to merge main after main upstream changes
vim.keymap.set({ "n" }, "<leader>gA", function()
    local res = vim.system({ "git", "merge-base", "HEAD", "main" }):wait()
    if res.code ~= 0 then
        vim.notify(string.format("Error getting commit sha: %s", res.stderr or res.stdout or ""), vim.log.levels.ERROR)
        return
    end

    -- Remove trailing newline
    local commit_sha = res.stdout:gsub("\n", "")
    vim.fn.setreg("+", commit_sha)
    vim.notify("Copied commit sha: " .. commit_sha, vim.log.levels.INFO)
end, { desc = "Copy shared main branch ancestor commit sha" })

-- Larger increments for window resizing
vim.keymap.set({ "n" }, "<C-w><", "5<C-w><", { noremap = true, desc = "Decrease width" })
vim.keymap.set({ "n" }, "<C-w>>", "5<C-w>>", { noremap = true, desc = "Increase width" })
vim.keymap.set({ "n" }, "<C-w>-", "5<C-w>-", { noremap = true, desc = "Decrease height" })
vim.keymap.set({ "n" }, "<C-w>+", "5<C-w>+", { noremap = true, desc = "Increase height" })

-- LSP inlay hint toggle
vim.keymap.set({ "n" }, "\\z", function()
    vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled({}))
end, { desc = "Toggle lsp inlay hints" })

-- Map up/down arrow for autocompletion selection in command mode
vim.keymap.set({ "c" }, "<Up>", "<C-p>", { desc = "Select previous" })
vim.keymap.set({ "c" }, "<Down>", "<C-n>", { desc = "Select next" })

vim.keymap.set({ "n" }, "<leader><f1>", function()
    vim.cmd.RustLsp("openDocs")
end, { desc = "Open Rust Doc" })

-- Iron Repl
vim.keymap.set({ "n" }, "<leader>rr", "<cmd>IronRepl<CR>", { desc = "Toggle Repl" })
vim.keymap.set({ "n" }, "<leader>rz", "<cmd>IronRestart<CR>", { desc = "Restart Repl" })
vim.keymap.set({ "n" }, "<leader>rq", function()
    require("iron.core").send(nil, string.char(03))
end, { desc = "Interrupt Repl" })
vim.keymap.set({ "n" }, "<leader>ri", "<cmd>IronFocus<CR>", { desc = "Focus Repl" })
vim.keymap.set({ "n", "v" }, "<leader>rF", function()
    require("iron.core").send_file()
end, { desc = "Send File" })
vim.keymap.set({ "n", "v" }, "<leader>rl", function()
    require("iron.core").send_line()
end, { desc = "Send Line" })
vim.keymap.set({ "n", "v" }, "<leader>rf", function()
    local iron = require("iron.core")
    iron.mark_visual()
    iron.send_mark()
    iron.mark_visual()
end, { desc = "Send Selection" })
vim.keymap.set({ "n", "v" }, "<leader>rb", function()
    require("iron.core").send_code_block(true)
end, { desc = "Send Code Block" })

-- Lua utils
vim.keymap.set({ "n", "v" }, "<leader>t", require("lua_utils").exec_lua, { desc = "Execute Lua" })

-- Terminal
-- Floating terminal.
vim.keymap.set({ "n" }, "<leader>z", function()
    require("float_term").float_term("zsh", { cwd = vim.fn.expand("%:p:h") })
end, { desc = "Toggle floating terminal" })

-- Ensure ctrl-c sends SIGINT in terminal mode
vim.keymap.set("t", "<C-c>", "\x03", { desc = "Send SIGINT" })

-- Exit terminal mode with ctrl-w hjkl buffer navigation
vim.keymap.set({ "t" }, "<C-w>h", "<C-\\><C-n><C-w>h", { desc = "Focus left" })
vim.keymap.set({ "t" }, "<C-w>j", "<C-\\><C-n><C-w>j", { desc = "Focus down" })
vim.keymap.set({ "t" }, "<C-w>k", "<C-\\><C-n><C-w>k", { desc = "Focus up" })
vim.keymap.set({ "t" }, "<C-w>l", "<C-\\><C-n><C-w>l", { desc = "Focus right" })

-- Exit terminal mode with ctrl-w <Esc> (not using escape so that it still sends <Esc> to terminal)
vim.keymap.set({ "t" }, "<C-w><Esc>", "<C-\\><C-n>", { desc = "Exit terminal mode" })

-- Close window while in terminal mode
vim.keymap.set({ "t" }, "<C-w>q", "<C-\\><C-n><C-w>q", { desc = "Quit current" })

-- Enter insert mode immediately when entering terminal window
vim.api.nvim_create_autocmd({ "BufWinEnter", "WinEnter" }, {
    pattern = { "term://*" },
    callback = function()
        vim.cmd("startinsert")
    end,
})

-- Tab setup
vim.keymap.set({ "n" }, "<leader>h", "<cmd>tabprevious<CR>", { desc = "Next Tab" })
vim.keymap.set({ "n" }, "<leader>l", "<cmd>tabnext<CR>", { desc = "Previous Tab" })
vim.keymap.set({ "n" }, "<leader>H", "<cmd>tabfirst<CR>", { desc = "First Tab" })
vim.keymap.set({ "n" }, "<leader>L", "<cmd>tablast<CR>", { desc = "Last Tab" })
vim.keymap.set({ "n" }, "<leader>1", "<cmd>1tabnext<CR>", { desc = "Tab 1" })
vim.keymap.set({ "n" }, "<leader>2", "<cmd>2tabnext<CR>", { desc = "Tab 2" })
vim.keymap.set({ "n" }, "<leader>3", "<cmd>3tabnext<CR>", { desc = "Tab 3" })
vim.keymap.set({ "n" }, "<leader>4", "<cmd>4tabnext<CR>", { desc = "Tab 4" })
vim.keymap.set({ "n" }, "<leader>5", "<cmd>5tabnext<CR>", { desc = "Tab 5" })
vim.keymap.set({ "n" }, "<leader>n", "<cmd>tab split<CR>", { desc = "New Tab" })
vim.keymap.set({ "n" }, "<leader>q", "<cmd>tabc<CR>", { desc = "Close Tab" })

-- LSP edit actions
vim.keymap.set({ "n" }, "<leader>vr", vim.lsp.buf.rename, { desc = "Rename Symbol" })
vim.keymap.set({ "n", "i" }, "<C-Space>", vim.lsp.buf.code_action, { desc = "Code Action" })

-- Misc. LSP
vim.keymap.set({ "n" }, "K", function()
    local clients = vim.lsp.get_clients({ bufnr = vim.api.nvim_get_current_buf() })
    local rust_lsp = false
    for _, client in ipairs(clients) do
        if client.name == "rust-analyzer" then
            rust_lsp = true
            break
        end
    end
    if rust_lsp then
        -- using RustLsp hover to get the rust-analyzer hover links
        vim.cmd("RustLsp hover actions")
    else
        vim.lsp.buf.hover()
    end
end, { desc = "Hover Text" })
