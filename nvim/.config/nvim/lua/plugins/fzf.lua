return {
    "ibhagwan/fzf-lua",
    -- optional for icon support
    dependencies = { "nvim-tree/nvim-web-devicons" },
    -- or if using mini.icons/mini.nvim
    -- dependencies = { "echasnovski/mini.icons" },
    --
    keys = {
        {
            "<leader>ff",
            function()
                require("fzf-lua").files()
            end,
            desc = "Find File",
        },
        {
            "<leader>fF",
            function()
                require("fzf-lua").oldfiles()
            end,
            desc = "Previous Files",
        },
        {
            "<leader>fg",
            function()
                require("fzf-lua").live_grep()
            end,
            desc = "Live Grep",
        },
        {
            "<leader>fb",
            function()
                require("fzf-lua").buffers()
            end,
            desc = "Find Buffer",
        },
        {
            "<leader>fz",
            function()
                require("fzf-lua").blines()
            end,
            desc = "Buffer Fuzzy Find",
        },
        {
            "<leader>fZ",
            function()
                require("fzf-lua").lines()
            end,
            desc = "All Buffer Fuzzy Find",
        },
        {
            "<leader>f?",
            function()
                require("fzf-lua").helptags()
            end,
            desc = "Find Help",
        },
        {
            "<leader>fw",
            function()
                require("fzf-lua").grep_cword()
            end,
            desc = "Grep Word Under Cursor",
        },
        {
            "<leader>fv",
            function()
                require("fzf-lua").grep_visual()
            end,
            mode = { "v" },
            desc = "Grep Visual Selection",
        },
        {
            "<leader>fr",
            function()
                require("fzf-lua").lsp_references()
            end,
            desc = "Find References",
        },
        {
            "<leader>fs",
            function()
                require("fzf-lua").lsp_document_symbols()
            end,
            desc = "Document Symbols",
        },
        {
            "<leader>fS",
            function()
                require("fzf-lua").lsp_workspace_symbols()
            end,
            desc = "Workspace Symbols",
        },
        {
            "<leader>fq",
            function()
                require("fzf-lua").diagnostics_workspace()
            end,
            desc = "LSP Diagnostics",
        },
        {
            "<leader>f:",
            function()
                require("fzf-lua").command_history()
            end,
            desc = "Command History",
        },
        {
            "<leader>f/",
            function()
                require("fzf-lua").search_history()
            end,
            desc = "Search History",
        },
        {
            "<leader>ft",
            function()
                require("fzf-lua").lsp_typedefs()
            end,
            desc = "Goto Type Definition(s)",
        },
        {
            "<leader>fd",
            function()
                require("fzf-lua").lsp_definitions()
            end,
            desc = "Goto Definition(s)",
        },
        {
            "<leader>fi",
            function()
                require("fzf-lua").lsp_implementations()
            end,
            desc = "Goto Implementation(s)",
        },
        {
            '<leader>f"',
            function()
                require("fzf-lua").registers()
            end,
            desc = "Registers",
        },
        {
            "<leader>f'",
            function()
                require("fzf-lua").marks()
            end,
            desc = "Marks",
        },
        {
            "<leader>fj",
            function()
                require("fzf-lua").jumps()
            end,
            desc = "Vim Jumplist",
        },
        {
            "<leader>fk",
            function()
                require("fzf-lua").keymaps()
            end,
            desc = "Vim Keymaps",
        },
        {
            "<leader>fu",
            function()
                require("fzf-lua").resume()
            end,
            desc = "Resume FzfLua",
        },
        {
            "<leader>f;",
            function()
                require("fzf-lua").commands()
            end,
            desc = "Neovim Commands",
        },
        {
            "<leader>fQ",
            function()
                require("fzf-lua").quickfix()
            end,
            desc = "Quickfix List",
        },
        {
            "<leader>fy",
            function()
                require("fzf-lua").treesitter()
            end,
            desc = "Treesitter Symbols",
        },
        {
            "<leader>fG",
            function()
                require("fzf-lua").git_branches()
            end,
            desc = "Git Branches",
        },
        {
            "<leader>fc",
            function()
                require("fzf-lua").git_bcommits()
            end,
            desc = "Buffer Git Commits",
        },
        {
            "<leader>fC",
            function()
                require("fzf-lua").git_commits()
            end,
            desc = "Git Commits",
        },
        {
            "<leader>fe",
            function()
                require("fzf-lua").git_status()
            end,
            desc = "Git Status",
        },
        {
            "<leader>fo",
            function()
                require("fzf-lua").git_stash()
            end,
            desc = "Git Stash",
        },
        {
            "<leader>fh",
            function()
                require("fzf-lua").highlights()
            end,
            desc = "Highlights",
        },
        {
            "<leader>va",
            function()
                require("fzf-lua").lsp_code_actions()
            end,
            mode = { "n", "x" },
            desc = "Code Action",
        },
        {
            "<leader>vs",
            function()
                require("fzf-lua").spell_suggest()
            end,
            mode = { "n", "x" },
            desc = "Spell Suggest",
        },
    },
    opts = {
        keymap = {
            builtin = {
                -- Enable defaults
                true,
                ["<C-d>"] = "preview-page-down",
                ["<C-u>"] = "preview-page-up",
            },
            fzf = {
                -- Enable defaults
                true,
                ["ctrl-d"] = "preview-page-down",
                ["ctrl-u"] = "preview-page-up",
            },
        },
        grep = {
            rg_opts = "--color=never --no-heading --hidden --with-filename --line-number --column --smart-case --trim --max-columns=4096 -g '!.git/' -g '!node_modules/' -e",
        },
    },
}
