return {
    "echasnovski/mini.clue",
    lazy = false,
    opts = function()
        local miniclue = require("mini.clue")
        return {
            window = {
                delay = 0,
                config = {
                    width = 70,
                },
            },
            triggers = {
                -- leader triggers
                { mode = "n", keys = "<leader>" },
                { mode = "x", keys = "<leader>" },

                -- Built-in completion
                { mode = "i", keys = "<C-x>" },

                -- `g` key
                { mode = "n", keys = "g" },
                { mode = "x", keys = "g" },

                -- Marks
                { mode = "n", keys = "'" },
                { mode = "n", keys = "`" },
                { mode = "x", keys = "'" },
                { mode = "x", keys = "`" },

                -- Registers
                { mode = "n", keys = '"' },
                { mode = "x", keys = '"' },
                { mode = "i", keys = "<C-r>" },
                { mode = "c", keys = "<C-r>" },

                -- Window commands
                { mode = "n", keys = "<C-w>" },
                { mode = "t", keys = "<C-w>" },

                -- `z` key
                { mode = "n", keys = "z" },
                { mode = "x", keys = "z" },

                -- Mode toggles
                { mode = "n", keys = "\\" },

                -- Navigation
                { mode = "n", keys = "[" },
                { mode = "x", keys = "[" },
                { mode = "n", keys = "]" },
                { mode = "x", keys = "]" },

                -- text ojects
                { mode = "o", keys = "i" },
                { mode = "x", keys = "i" },
                { mode = "o", keys = "a" },
                { mode = "x", keys = "a" },
            },

            clues = {
                -- common
                miniclue.gen_clues.builtin_completion(),
                miniclue.gen_clues.g(),
                miniclue.gen_clues.marks(),
                miniclue.gen_clues.registers({ show_contents = true }),
                miniclue.gen_clues.windows({ submode_resize = true }),
                miniclue.gen_clues.z(),

                -- Buffers
                { mode = "n", keys = "<leader>b", desc = "+Buffers" },

                -- FzfLua
                { mode = "n", keys = "<leader>f", desc = "+FzfLua" },

                -- Direct Editing
                { mode = "n", keys = "<leader>v", desc = "+Editing Actions" },
                { mode = "x", keys = "<leader>v", desc = "+Editing Actions" },

                -- Quckfix
                { mode = "n", keys = "<leader>x", desc = "+Loclist/Quickfix" },

                -- Git
                { mode = "n", keys = "<leader>g", desc = "+Git" },
                { mode = "n", keys = "<leader>gn", postkeys = "<leader>g" },
                { mode = "n", keys = "<leader>gp", postkeys = "<leader>g" },

                -- Code Companion
                { mode = "n", keys = "<leader>c", desc = "+Code Companion" },

                -- Iron Repl
                { mode = "n", keys = "<leader>r", desc = "+Iron Repl" },
            },
        }
    end,
}
