-- Remove default kepmaps introduced in neovim 0.11
vim.keymap.del("n", "gra")
vim.keymap.del("n", "gri")
vim.keymap.del("n", "grn")
vim.keymap.del("n", "grr")
vim.keymap.del("n", "grt")

require("config.lazy")
require("config.patches")
require("config.keymappings")
require("autocmds")

local settings = require("config.settings")

-- General settings (using mini.basics as a starting point)
local o = vim.opt

-- File handling
o.updatetime = 750 -- If nothing typed for this many milliseconds then swap file is written to disk (for crash recovery)
o.undofile = true -- Enable persistent undo (see also `:h undodir`)
o.backup = false -- Don't store backup while overwriting the file
o.writebackup = false -- Don't store backup while overwriting the file

-- Misc
o.mouse = "a" -- Enable mouse for all available modes
vim.cmd("filetype plugin indent on") -- Enable all filetype plugins
o.termguicolors = true -- Enable gui colors
o.splitkeep = "screen" -- Reduce scroll during window split
o.shortmess:append("WcC") -- Reduce command line messages

-- Appearance
o.breakindent = true -- Indent wrapped lines to match line start
o.cursorline = true -- Highlight current line
o.linebreak = true -- Wrap long lines at 'breakat' (if 'wrap' is set)
o.number = true -- Show line numbers
o.relativenumber = true -- Show relative line numbers
o.splitbelow = true -- Horizontal splits will be below
o.splitright = true -- Vertical splits will be to the right
vim.opt.listchars = { space = "⋅", trail = "⋅", tab = "  ↦" } -- Whitespace characters
vim.opt.fillchars = {
    eob = " ",
    fold = " ",
    foldclose = "",
    foldopen = "",
    foldsep = " ",
    msgsep = "─",
}

o.ruler = false -- Don't show cursor position in command line
o.showmode = false -- Don't show mode in command line
o.wrap = false -- Display long lines as just one line
vim.lsp.inlay_hint.enable(false) -- Turn off lsp inlay hints by default
vim.diagnostic.config({ virtual_text = { current_line = true } }) -- Start with diagnostic messages in the current line

o.signcolumn = "yes" -- Always show sign column (otherwise it will shift text)
o.pumheight = 10 -- Keep popup menus from being too tall (limit to 10 items)

-- Editing
o.ignorecase = true -- Ignore case when searching (use `\C` to force not doing that)
o.incsearch = true -- Show search results while typing
o.infercase = true -- Infer letter cases for a richer built-in keyword completion
o.smartcase = true -- Don't ignore case when searching if pattern has upper case
o.smartindent = true -- Make indenting smart (NOTE: `guess-indent` plugin will auto match existing file for indent settings so this doesn't matter much)
o.inccommand = "split" -- Show substitutions in a split window
vim.o.scrolloff = 8 -- Keep 8 lines visible above/below cursor

o.completeopt = "menuone,noselect" -- Customize completions
o.virtualedit = "block" -- Allow going past the end of line in visual block mode
o.formatoptions = "qjl1" -- Don't autoformat comments
o.diffopt:append("algorithm:histogram,vertical,context:15,indent-heuristic") -- Better default algorithm, vertical split diffs, set context 15 to avoid excessive folding, and use indent heuristic

-- Colorscheme
vim.cmd.colorscheme(settings.colorscheme)
o.background = settings.background

-- Folds
vim.o.foldenable = true
vim.o.foldlevel = 99
vim.o.foldtext = ""

vim.opt.foldcolumn = "0"
vim.o.foldmethod = "expr"
-- Default to treesitter folding
vim.o.foldexpr = "v:lua.vim.treesitter.foldexpr()"

-- Default to rounded borders for floating windows (only if unset)
-- NOTE: this was added initially for lsp hover windows
local orig_util_open_floating_preview = vim.lsp.util.open_floating_preview
---@diagnostic disable-next-line: duplicate-set-field
function vim.lsp.util.open_floating_preview(contents, syntax, opts, ...)
    opts = opts or {}
    opts.border = opts.border or "rounded"
    return orig_util_open_floating_preview(contents, syntax, opts, ...)
end

-- using mason for lsp setup
require("mason").setup()
-- mason-lspconfig just to simplify setup of lsp
require("mason-lspconfig").setup({
    -- exclude rust_analyzer from automatic enable since it's handled by rustaceanvim
    automatic_enable = { exclude = { "rust_analyzer" } },
    ensure_installed = {
        "gopls",
        "lua_ls",
        "pyright",
        "ruff",
        "rust_analyzer",
        "terraformls",
        "zls",
    },
})
