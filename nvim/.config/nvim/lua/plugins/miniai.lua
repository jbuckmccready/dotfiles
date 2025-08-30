return {
    "nvim-mini/mini.ai",
    lazy = false,
    opts = function()
        local miniai = require("mini.ai")

        return {
            n_lines = 300,
            custom_textobjects = {
                -- Use treesitter for function object
                f = miniai.gen_spec.treesitter({ a = "@function.outer", i = "@function.inner" }, {}),
                -- Whole buffer.
                g = function()
                    local from = { line = 1, col = 1 }
                    local to = {
                        line = vim.fn.line("$"),
                        col = math.max(vim.fn.getline("$"):len(), 1),
                    }
                    return { from = from, to = to }
                end,
            },
            -- Disable error feedback.
            silent = true,
            mappings = {
                -- Disable next/last variants.
                around_next = "",
                inside_next = "",
                around_last = "",
                inside_last = "",
            },
        }
    end,
}
