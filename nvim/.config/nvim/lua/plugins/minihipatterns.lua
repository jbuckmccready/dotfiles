-- Highlight patterns in text.
return {
    {
        "echasnovski/mini.hipatterns",
        event = "BufReadPost",
        opts = function()
            local highlighters = {}

            vim.api.nvim_set_hl(0, "MiniHipatternsNote", { link = "@comment.note" })
            vim.api.nvim_set_hl(0, "MiniHipatternsTodo", { link = "@comment.todo" })
            vim.api.nvim_set_hl(0, "MiniHipatternsFixme", { link = "@comment.todo" })
            vim.api.nvim_set_hl(0, "MiniHipatternsHack", { link = "@comment.warning" })
            for _, word in ipairs({ "note", "todo", "fixme", "hack" }) do
                highlighters[word] = {
                    pattern = string.format("%%f[%%w]()%s()%%f[%%W]", word:upper()),
                    group = string.format("MiniHipatterns%s", word:sub(1, 1):upper() .. word:sub(2)),
                }
            end

            return { highlighters = highlighters }
        end,
    },
}
