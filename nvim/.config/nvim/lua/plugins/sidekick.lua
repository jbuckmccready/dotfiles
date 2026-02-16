return {
    "folke/sidekick.nvim",
    event = "VeryLazy",
    keys = {
        {
            "<leader>at",
            function()
                require("sidekick.nes").toggle()
            end,
            desc = "Toggle Edit Suggestions",
        },
        {
            "<tab>",
            function()
                -- if there is a next edit, jump to it, otherwise apply it if any
                if not require("sidekick").nes_jump_or_apply() then
                    return "<Tab>" -- fallback to normal tab
                end
            end,
            expr = true,
            desc = "Goto/Apply Next Edit Suggestion",
        },
        {
            "<leader>as",
            function()
                require("sidekick.cli").send({ msg = "{this}" })
            end,
            mode = { "x", "n" },
            desc = "Send This",
        },
        {
            "<leader>ag",
            function()
                require("sidekick.cli").send({ msg = "{selection}" })
            end,
            mode = { "x" },
            desc = "Send Visual Selection",
        },
        {
            "<leader>am",
            function()
                local cli = require("sidekick.cli")
                local _, text = cli.render("{this}")
                if not text or #text == 0 then
                    return
                end
                vim.ui.input({ prompt = "Message: " }, function(input)
                    if input and input ~= "" then
                        text[#text + 1] = { { " " .. input } }
                        cli.send({ text = text, submit = true })
                    end
                end)
            end,
            mode = { "x", "n" },
            desc = "Send This with Message",
        },
        {
            "<leader>af",
            function()
                require("sidekick.cli").send({ msg = "{file}" })
            end,
            desc = "Send File",
        },
        {
            "<leader>ab",
            function()
                require("sidekick.cli").send({ msg = "{buffers}" })
            end,
            desc = "Send Buffers",
        },
        {
            "<leader>aw",
            function()
                require("sidekick.cli").select({ filter = { installed = true } })
            end,
            desc = "Toggle AI CLI",
            mode = { "n", "v" },
        },
        {
            "<leader>ad",
            function()
                require("sidekick.cli").close()
            end,
            desc = "Detach a CLI Session",
        },
        {
            "<leader>aa",
            function()
                require("sidekick.cli").toggle({ name = "agent-sandbox", focus = true })
            end,
            desc = "Toggle Agent Sandbox CLI",
            mode = { "n", "v" },
        },
        {
            "<leader>ac",
            function()
                require("sidekick.cli").toggle({ name = "claude", focus = true })
            end,
            desc = "Toggle Claude CLI",
            mode = { "n", "v" },
        },
        {
            "<leader>ai",
            function()
                require("sidekick.cli").toggle({ name = "pi", focus = true })
            end,
            desc = "Toggle Pi CLI",
            mode = { "n", "v" },
        },
        {
            "<leader>ap",
            function()
                require("sidekick.cli").prompt()
            end,
            desc = "Select AI Prompt",
            mode = { "n", "v" },
        },
    },
    opts = {
        nes = {
            enabled = false,
        },
        cli = {
            watch = true, -- watch for file changes in CLI
            win = {
                layout = "right",
                split = {
                    width = 0,
                },
                keys = {
                    -- Disable all default CLI keymaps except navigation (avoid conflicts with cli tools)
                    buffers = false,
                    files = false,
                    hide_n = false,
                    hide_ctrl_q = false,
                    hide_ctrl_dot = false,
                    hide_ctrl_z = false,
                    prompt = false,
                    stopinsert = false,
                },
            },
            tools = {
                pi = {
                    cmd = { "pi" },
                    is_proc = "\\<pi\\>",
                    url = "https://github.com/badlogic/pi-mono",
                },
                ["agent-sandbox"] = {
                    cmd = { "true" },
                    is_proc = "agent-sandbox",
                },
            },
            mux = {
                backend = "tmux",
                enabled = true,
                create = "split",
                split = {
                    vertical = true,
                    size = 0.4,
                },
            },
        },
    },
    config = function(_, opts)
        require("sidekick").setup(opts)

        -- Setup mappings for sidekick terminal buffers
        vim.api.nvim_create_autocmd("FileType", {
            pattern = "sidekick_terminal",
            callback = function(ev)
                -- Helper function to extract file and line number like gF does
                -- Supports: file:123, file@123, file(123), file 123, file line 123
                -- Returns nil if file doesn't exist (with error notification), or file and line number
                local function parse_and_validate_file()
                    local file = vim.fn.expand("<cfile>")
                    local current_line = vim.fn.getline(".")

                    -- Check if file exists
                    if vim.fn.filereadable(file) == 0 then
                        vim.notify(string.format('Can\'t find file "%s"', file), vim.log.levels.ERROR)
                        return nil
                    end

                    -- Find the filename in the current line and get everything after it
                    -- Using plain text search (4th arg = true), so no pattern escaping needed
                    local file_start, file_end = current_line:find(file, 1, true)

                    if not file_start then
                        return file, 1
                    end

                    local after_file = current_line:sub(file_end + 1)

                    -- Try various formats that gF supports
                    local line = after_file:match("^%s*:%s*(%d+)") -- :123 or : 123
                        or after_file:match("^%s*@%s*(%d+)") -- @123 or @ 123
                        or after_file:match("^%s*%((%d+)%)") -- (123) or (123)
                        or after_file:match("^%s+line%s+(%d+)") -- line 123
                        or after_file:match("^%s+(%d+)") -- 123

                    return file, tonumber(line) or 1
                end

                -- Modify gf and gF to open files in the left window and avoid insert mode in new tab
                vim.keymap.set("n", "gf", function()
                    local file = parse_and_validate_file()
                    if not file then
                        return
                    end

                    vim.cmd("wincmd h") -- Move to left window
                    vim.cmd("edit " .. file)
                end, { buffer = ev.buf, desc = "Open file in left window" })

                vim.keymap.set("n", "gF", function()
                    local file, line = parse_and_validate_file()
                    if not file then
                        return
                    end

                    vim.cmd("wincmd h")
                    vim.cmd("edit +" .. line .. " " .. file)
                    vim.cmd("normal! ^")
                end, { buffer = ev.buf, desc = "Open file at line in left window" })

                vim.keymap.set("n", "<C-w>gf", function()
                    local file = parse_and_validate_file()
                    if not file then
                        return
                    end

                    vim.cmd("tabnew " .. file)
                    -- Ensure we stay in normal mode (seems to carry over from terminal when going to new tab)
                    vim.cmd("stopinsert")
                end, { buffer = ev.buf, desc = "Open file in new tab" })

                vim.keymap.set("n", "<C-w>gF", function()
                    local file, line = parse_and_validate_file()
                    if not file then
                        return
                    end

                    vim.cmd("tabnew +" .. line .. " " .. file)
                    vim.cmd("normal! ^")
                    -- Ensure we stay in normal mode (seems to carry over from terminal when going to new tab)
                    vim.cmd("stopinsert")
                end, { buffer = ev.buf, desc = "Open file at line in new tab" })
            end,
        })
    end,
}
