return {
    "coder/claudecode.nvim",
    dependencies = { "folke/snacks.nvim" },
    config = true,
    keys = {
        { "<leader>a", nil, desc = "AI/Claude Code" },
        { "<leader>ac", "<cmd>ClaudeCode<cr>", desc = "Toggle Claude" },
        { "<leader>af", "<cmd>ClaudeCodeFocus<cr>", desc = "Focus Claude" },
        { "<leader>ar", "<cmd>ClaudeCode --resume<cr>", desc = "Resume Claude" },
        { "<leader>aC", "<cmd>ClaudeCode --continue<cr>", desc = "Continue Claude" },
        { "<leader>am", "<cmd>ClaudeCodeSelectModel<cr>", desc = "Select Claude model" },
        {
            "<leader>ab",
            function()
                -- Resolve symlinks first, then make relative to cwd
                -- this ensures the path is consistently relative to cwd regardless of how the buffer was opened
                local abs_path = vim.fn.expand("%:p")
                local resolved_path = vim.fn.resolve(abs_path)
                local rel_path = vim.fn.fnamemodify(resolved_path, ":.")
                vim.cmd("ClaudeCodeAdd " .. vim.fn.fnameescape(rel_path))
            end,
            desc = "Add current buffer",
        },
        { "<leader>as", "<cmd>ClaudeCodeSend<cr>", mode = "v", desc = "Send to Claude" },
        {
            "<leader>ag",
            function()
                -- Get visual selection using getregion
                local lines = vim.fn.getregion(vim.fn.getpos("v"), vim.fn.getpos("."))
                local text = table.concat(lines, "\n")

                -- Get terminal buffer and send text
                local term = require("claudecode.terminal")
                local bufnr = term.get_active_terminal_bufnr()
                if bufnr then
                    local chan = vim.bo[bufnr].channel
                    vim.fn.chansend(chan, text .. "\n")
                    vim.cmd("ClaudeCodeFocus")
                else
                    vim.notify("Claude Code terminal not found", vim.log.levels.WARN)
                end
            end,
            mode = "v",
            desc = "Send selected text to Claude",
        },
        {
            "<leader>as",
            "<cmd>ClaudeCodeTreeAdd<cr>",
            desc = "Add file",
            ft = { "NvimTree", "neo-tree", "oil", "minifiles", "netrw" },
        },
        -- Diff management
        { "<leader>aa", "<cmd>ClaudeCodeDiffAccept<cr>", desc = "Accept diff" },
        { "<leader>ad", "<cmd>ClaudeCodeDiffDeny<cr>", desc = "Deny diff" },
    },
    opts = {
        terminal_cmd = "claude --ide",
        focus_after_send = true,
        terminal = {
            split_side = "right", -- "left" or "right"
            split_width_percentage = 0.40,
            provider = "auto", -- "auto", "snacks", "native", "external", "none", or custom provider table
            auto_close = true,
            snacks_win_opts = {}, -- Opts to pass to `Snacks.terminal.open()` - see Floating Window section below

            -- Provider-specific options
            provider_opts = {
                -- Command for external terminal provider. Can be:
                -- 1. String with %s placeholder: "alacritty -e %s" (backward compatible)
                -- 2. String with two %s placeholders: "alacritty --working-directory %s -e %s" (cwd, command)
                -- 3. Function returning command: function(cmd, env) return "alacritty -e " .. cmd end
                -- NOTE: added here just for reference
                external_terminal_cmd = "tmux split-window -h -c %s %s --ide",
            },
        },
    },
}
