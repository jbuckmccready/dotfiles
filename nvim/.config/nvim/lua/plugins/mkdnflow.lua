return {
    "jakewvincent/mkdnflow.nvim",
    ft = "markdown",
    opts = {
        modules = {
            bib = false,
            buffers = false,
            conceal = true,
            cursor = true,
            folds = false,
            links = true,
            lists = true,
            maps = true,
            paths = true,
            tables = true,
            yaml = false,
            cmp = false,
        },
        perspective = {
            priority = "current",
            fallback = "current",
            root_tell = false,
            nvim_wd_heel = false,
            update = false,
        },
        mappings = {
            -- turn on insert mode MkdnEnter for auto list bullet creation on <CR>
            MkdnEnter = { { "n", "v", "i" }, "<CR>" },
            MkdnFoldSection = false,
            MkdnUnfoldSection = false,
            MkdnTableNextCell = false,
            MkdnTablePrevCell = false,
        },
    },
}
