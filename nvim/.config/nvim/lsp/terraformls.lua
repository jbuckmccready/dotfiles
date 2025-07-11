return {
    root_dir = function(bufnr, on_dir)
        local buf_name = vim.api.nvim_buf_get_name(bufnr)
        local buf_filetype = vim.bo[bufnr].filetype

        -- Don't attach to diffview buffers at all (warnings etc. due to not having workspace)
        if
            buf_filetype == "DiffviewFiles"
            or buf_filetype == "DiffviewFileHistory"
            or string.match(buf_name, "diffview://")
        then
            return -- Don't call on_dir() to prevent attachment
        end

        -- Use standard terraform root detection from lspconfig
        local root = require("lspconfig.util").root_pattern(".terraform", ".git")(buf_name)
        if root then
            on_dir(root)
        end
    end,
}
