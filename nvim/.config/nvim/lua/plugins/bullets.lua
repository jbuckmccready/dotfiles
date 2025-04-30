return {
    "bullets-vim/bullets.vim",
    lazy = false,
    init = function()
        vim.g.bullets_set_mappings = 0
        vim.g.bullets_checkbox_markers = " -x"

        vim.g.bullets_custom_mappings = {
            { "imap", "<cr>", "<Plug>(bullets-newline)" },
            { "nmap", "o", "<Plug>(bullets-newline)" },
            { "nmap", "<C-Space>", "<Plug>(bullets-toggle-checkbox)" },
            { "vmap", "<leader>mR", "<Plug>(bullets-renumber)" },
            { "nmap", "<leader>mR", "<Plug>(bullets-renumber)" },
        }
    end,
}
