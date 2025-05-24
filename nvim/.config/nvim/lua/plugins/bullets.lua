return {
    "bullets-vim/bullets.vim",
    lazy = false,
    init = function()
        vim.g.bullets_set_mappings = 0 -- disable default mappings
        vim.g.bullets_checkbox_markers = " -x" -- lowercase x
        vim.g.bullets_outline_levels = { "ROM", "ABC", "num", "abc", "rom", "std-" } -- use only `-` for lists

        vim.g.bullets_custom_mappings = {
            { "imap", "<cr>", "<Plug>(bullets-newline)" },
            { "nmap", "o", "<Plug>(bullets-newline)" },
            { "nmap", "<C-Space>", "<Plug>(bullets-toggle-checkbox)" },
        }
    end,
}
