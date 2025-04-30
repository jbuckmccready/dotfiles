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
            -- Only enable MkdnEnter for norma nd visual modes, insert mode causes issues with blink-cmp, using bullets.vim instead
            MkdnEnter = { { "n", "v" }, "<CR>" },
            MkdnFoldSection = false,
            MkdnUnfoldSection = false,
            MkdnTableNextCell = false,
            MkdnTablePrevCell = false,
        },
    },
}
