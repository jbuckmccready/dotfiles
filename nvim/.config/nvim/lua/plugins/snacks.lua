return {
    "folke/snacks.nvim",
    priority = 1000,
    lazy = false,
    opts = {
        bigfile = { enabled = true },
        dashboard = { enabled = true },
        explorer = { enabled = true },
        indent = {
            enabled = true,
            indent = {
                enabled = true,
                only_scope = false,
                only_current = false,
            },
            animate = {
                enabled = false,
            },
            scope = {
                enabled = true, -- enable highlighting the current scope
                underline = false, -- underline the start of the scope
                only_current = true, -- only show scope in the current window
            },
        },
        input = { enabled = true },
        notifier = {
            enabled = true,
            timeout = 3000,
        },
        picker = {
            enabled = true,
            sources = {
                explorer = {
                    hidden = true,
                },
            },
            win = {
                input = {
                    keys = {
                        ["<a-s>"] = { "flash", mode = { "n", "i" } },
                        ["s"] = { "flash" },
                        ["yy"] = { "yank", mode = "n" }, -- Yank item's text in normal mode
                    },
                },
            },
            actions = {
                flash = function(picker)
                    require("flash").jump({
                        pattern = "^",
                        label = { after = { 0, 0 } },
                        search = {
                            mode = "search",
                            exclude = {
                                function(win)
                                    return vim.bo[vim.api.nvim_win_get_buf(win)].filetype ~= "snacks_picker_list"
                                end,
                            },
                        },
                        action = function(match)
                            local idx = picker.list:row2idx(match.pos[1])
                            picker.list:_move(idx, true, true)
                        end,
                    })
                end,
            },
        },
        quickfile = { enabled = false },
        scope = {
            enabled = true,
            -- debounce scope detection in ms
            debounce = 50,
            treesitter = {
                -- falls back to indent based detection if not available
                enabled = true,
                injections = true, -- include language injections when detecting scope (useful for languages like `vue`)
            },
        },
        scroll = { enabled = false },
        statuscolumn = { enabled = true },
        terminal = { win = { style = "float" } },
        words = { enabled = true },
        styles = {
            notification = {
                -- wo = { wrap = true } -- Wrap notifications
            },
        },
    },
    keys = function()
        local Snacks = require("snacks")
        return {
            -- stylua: ignore start
            -- Top Pickers & Explorer
            { "<leader><space>", function() Snacks.picker.smart() end, desc = "Smart Find Files" },
            { "<leader>,", function() Snacks.picker.buffers() end, desc = "Buffers" },
            { "<leader>/", function() Snacks.picker.grep() end, desc = "Grep" },
            { "<leader>:", function() Snacks.picker.command_history() end, desc = "Command History" },
            { "<leader>n", function() Snacks.picker.notifications() end, desc = "Notification History" },
            -- stylua: ignore end
            {
                "<leader>e",
                function()
                    local opts = {
                        win = {
                            list = {
                                keys = {
                                    ["g."] = "set_cwd",
                                },
                            },
                        },
                        actions = {
                            set_cwd = function(picker)
                                picker:set_cwd(picker:dir())
                                vim.cmd("cd " .. picker:dir())
                            end,
                        },
                    }

                    Snacks.explorer(opts)
                end,
                desc = "File Explorer",
            },
            -- stylua: ignore start
            -- find
            { "<leader>fb", function() Snacks.picker.buffers() end, desc = "Buffers" },
            { "<leader>fc", function() Snacks.picker.files({ cwd = vim.fn.stdpath("config") }) end, desc = "Find Config File" },
            { "<leader>ff", function() Snacks.picker.files() end, desc = "Find Files" },
            { "<leader>fg", function() Snacks.picker.git_files() end, desc = "Find Git Files" },
            { "<leader>fp", function() Snacks.picker.projects() end, desc = "Projects" },
            { "<leader>fr", function() Snacks.picker.recent() end, desc = "Recent" },
            -- git related
            { "<leader>gb", function() Snacks.picker.git_branches() end, desc = "Git Branches" },
            { "<leader>gl", function() Snacks.picker.git_log() end, desc = "Git Log" },
            { "<leader>gL", function() Snacks.picker.git_log_line() end, desc = "Git Log Line" },
            { "<leader>gs", function() Snacks.picker.git_status() end, desc = "Git Status" },
            { "<leader>gS", function() Snacks.picker.git_stash() end, desc = "Git Stash" },
            { "<leader>gh", function() Snacks.picker.git_diff() end, desc = "Git Diff (Hunks)" },
            { "<leader>gF", function() Snacks.picker.git_log_file() end, desc = "Git Log File" },
            { "<leader>go", function() Snacks.gitbrowse() end, desc = "Git Open in Browser", mode = { "n", "v" } },
            { "<leader>gg", function() Snacks.lazygit() end, desc = "Lazygit" },
            -- Grep
            { "<leader>sb", function() Snacks.picker.lines() end, desc = "Buffer Lines" },
            { "<leader>sB", function() Snacks.picker.grep_buffers() end, desc = "Grep Open Buffers" },
            { "<leader>sg", function() Snacks.picker.grep() end, desc = "Grep" },
            { "<leader>sw", function() Snacks.picker.grep_word() end, desc = "Visual selection or word", mode = { "n", "x" } },
            -- search
            { '<leader>s"', function() Snacks.picker.registers() end, desc = "Registers" },
            { "<leader>s/", function() Snacks.picker.search_history() end, desc = "Search History" },
            { "<leader>sa", function() Snacks.picker.autocmds() end, desc = "Autocmds" },
            { "<leader>sb", function() Snacks.picker.lines() end, desc = "Buffer Lines" },
            { "<leader>sc", function() Snacks.picker.command_history() end, desc = "Command History" },
            { "<leader>sC", function() Snacks.picker.commands() end, desc = "Commands" },
            { "<leader>sd", function() Snacks.picker.diagnostics() end, desc = "Diagnostics" },
            { "<leader>sD", function() Snacks.picker.diagnostics_buffer() end, desc = "Buffer Diagnostics" },
            { "<leader>sh", function() Snacks.picker.help() end, desc = "Help Pages" },
            { "<leader>sH", function() Snacks.picker.highlights() end, desc = "Highlights" },
            { "<leader>si", function() Snacks.picker.icons() end, desc = "Icons" },
            { "<leader>sj", function() Snacks.picker.jumps() end, desc = "Jumps" },
            { "<leader>sk", function() Snacks.picker.keymaps() end, desc = "Keymaps" },
            { "<leader>sl", function() Snacks.picker.loclist() end, desc = "Location List" },
            { "<leader>sm", function() Snacks.picker.marks() end, desc = "Marks" },
            { "<leader>sM", function() Snacks.picker.man() end, desc = "Man Pages" },
            { "<leader>sp", function() Snacks.picker.lazy() end, desc = "Search for Plugin Spec" },
            { "<leader>sq", function() Snacks.picker.qflist() end, desc = "Quickfix List" },
            { "<leader>sR", function() Snacks.picker.resume() end, desc = "Resume" },
            { "<leader>su", function() Snacks.picker.undo() end, desc = "Undo History" },
            -- LSP
            { "gd", function() Snacks.picker.lsp_definitions() end, desc = "Goto Definition" },
            { "gD", function() Snacks.picker.lsp_declarations() end, desc = "Goto Declaration" },
            { "gr", function() Snacks.picker.lsp_references() end, nowait = true, desc = "References" },
            { "gI", function() Snacks.picker.lsp_implementations() end, desc = "Goto Implementation" },
            { "gy", function() Snacks.picker.lsp_type_definitions() end, desc = "Goto T[y]pe Definition" },
            { "<leader>ss", function() Snacks.picker.lsp_symbols() end, desc = "LSP Symbols" },
            { "<leader>sS", function() Snacks.picker.lsp_workspace_symbols() end, desc = "LSP Workspace Symbols" },
            -- Other
            { "<leader>sn", function() Snacks.words.jump(1, true) end, desc = "Jump to Next LSP Word" },
            { "<leader>sy", function() Snacks.picker.treesitter() end, desc = "Treesitter" },
            { "<leader>va", function() vim.lsp.buf.code_action() end, desc = "Code Action" },
            { "<leader>vs", function() Snacks.picker.spelling() end, desc = "Spell Suggest" },
            { "<leader>.", function() Snacks.scratch() end, desc = "Toggle Scratch Buffer" },
            { "<leader>S", function() Snacks.scratch.select() end, desc = "Select Scratch Buffer" },
            { "<leader>n", function() Snacks.notifier.show_history() end, desc = "Notification History" },
            { "<leader>vR", function() Snacks.rename.rename_file() end, desc = "Rename File" },
            { "<leader>un", function() Snacks.notifier.hide() end, desc = "Dismiss All Notifications" },
            { "<leader>z", function() Snacks.terminal() end, desc = "Toggle Terminal" },
            -- stylua: ignore end
            {
                "<leader>gG",
                function()
                    local config_path = vim.fn.expand("~/.config/lazygit/difftastic-config.yml")
                    Snacks.lazygit({ args = { "--use-config-file", config_path } })
                end,
                desc = "Lazygit Difftastic",
            },
        }
    end,
    init = function()
        vim.api.nvim_create_autocmd("User", {
            pattern = "VeryLazy",
            callback = function()
                local Snacks = require("snacks")
                -- Setup some globals for debugging (lazy-loaded)
                _G.dd = function(...)
                    Snacks.debug.inspect(...)
                end
                _G.bt = function()
                    Snacks.debug.backtrace()
                end
                vim.print = _G.dd -- Override print to use snacks for `:=` command

                -- Create some toggle mappings
                -- Snacks.toggle.option("spell", { name = "Spelling" }):map("<leader>us")
                -- Snacks.toggle.option("wrap", { name = "Wrap" }):map("<leader>uw")
                -- Snacks.toggle.option("relativenumber", { name = "Relative Number" }):map("<leader>uL")
                -- Snacks.toggle.diagnostics():map("<leader>ud")
                -- Snacks.toggle.line_number():map("<leader>ul")
                -- Snacks.toggle
                --     .option("conceallevel", { off = 0, on = vim.o.conceallevel > 0 and vim.o.conceallevel or 2 })
                --     :map("<leader>uc")
                -- Snacks.toggle.treesitter():map("<leader>uT")
                -- Snacks.toggle
                --     .option("background", { off = "light", on = "dark", name = "Dark Background" })
                --     :map("<leader>ub")
                -- Snacks.toggle.inlay_hints():map("<leader>uh")
                -- Snacks.toggle.indent():map("<leader>ug")
                -- Snacks.toggle.dim():map("<leader>uD")
            end,
        })
    end,
}
