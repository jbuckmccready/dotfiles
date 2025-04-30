return {
    "bullets-vim/bullets.vim",
    lazy = false,
    init = function()
        -- just using for new line bullet creation and
        vim.g.bullets_set_mappings = 0
        vim.g.bullets_custom_mappings = {
            { "imap", "<cr>", "<Plug>(bullets-newline)" },
            { "vmap", "<leader>mR", "<Plug>(bullets-renumber)" },
            { "nmap", "<leader>mR", "<Plug>(bullets-renumber)" },
        }
    end,
}
