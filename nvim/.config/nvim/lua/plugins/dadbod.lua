-- NOTE: for clickhouse use `clickhouse://{user}:{password}@{host}:{port}/{database}`
-- and use `FORMAT CSVWithNames` in the query to get CSV output with :CsvViewEnable
-- for pretty formatting
--
-- NOTE: for postgres (uses psql) can do the same with the following:
-- Copy (select * from <your query here>) To STDOUT (FORMAT CSV, HEADER, DELIMITER ',');
return {
    "kristijanhusak/vim-dadbod-ui",
    dependencies = {
        { "tpope/vim-dadbod" },
        { "kristijanhusak/vim-dadbod-completion", ft = { "sql", "mysql", "plsql" } },
    },
    keys = { -- Mapping to toggle DBUI
        { "<leader>d", "<cmd>DBUIToggle<CR>", desc = "Toggle DBUI" },
    },
    cmd = {
        "DBUI",
        "DBUIToggle",
        "DBUIAddConnection",
        "DBUIFindBuffer",
    },
    init = function()
        vim.g.db_ui_show_help = 0
        vim.g.db_ui_use_nerd_fonts = 1
        vim.g.db_ui_use_nvim_notify = 1
        vim.g.db_ui_winwidth = 50

        -- 2 space tab indent for the ui tree (filetype=dbui)
        vim.api.nvim_create_augroup("DadbodUISettings", { clear = true })
        vim.api.nvim_create_autocmd("FileType", {
            pattern = "dbui",
            group = "DadbodUISettings",
            callback = function()
                vim.opt_local.expandtab = true
                vim.opt_local.shiftwidth = 2
                vim.opt_local.softtabstop = 2
            end,
        })

        -- This sets the location of the `connections.json` file, which includes the
        -- DB conection strings, the default location for this is `~/.local/share/db_ui`
        -- vim.g.db_ui_save_location = "~/.ssh/dbui"
    end,
}
