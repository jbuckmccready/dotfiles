return {
    "nvim-mini/mini.clue",
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

                -- `z` key
                { mode = "n", keys = "z" },
                { mode = "x", keys = "z" },

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

                -- Snacks
                { mode = "n", keys = "<leader>f", desc = "+Find" },
                { mode = "n", keys = "<leader>s", desc = "+Search" },
                { mode = "n", keys = "<leader>sn", postkeys = "<leader>s" },

                -- Tabs
                { mode = "n", keys = "<leader>t", desc = "+Tabs" },

                -- Toggles
                { mode = "n", keys = "<leader>u", desc = "+Toggles/Misc" },

                -- Multicursor
                { mode = "n", keys = "<leader>m", desc = "+Multicursor" },
                { mode = "x", keys = "<leader>m", desc = "+Multicursor" },
                { mode = "n", keys = "<leader>mL", postkeys = "<leader>m" },
                { mode = "n", keys = "<leader>mn", postkeys = "<leader>m" },
                { mode = "x", keys = "<leader>mn", postkeys = "<leader>m" },
                { mode = "n", keys = "<leader>ms", postkeys = "<leader>m" },
                { mode = "n", keys = "<leader>mN", postkeys = "<leader>m" },
                { mode = "x", keys = "<leader>mN", postkeys = "<leader>m" },
                { mode = "x", keys = "<leader>ms", postkeys = "<leader>m" },
                { mode = "n", keys = "<leader>mS", postkeys = "<leader>m" },
                { mode = "n", keys = "<leader>mH", postkeys = "<leader>m" },
                { mode = "x", keys = "<leader>mS", postkeys = "<leader>m" },
                { mode = "x", keys = "<leader>mH", postkeys = "<leader>m" },
                { mode = "x", keys = "<leader>mL", postkeys = "<leader>m" },

                -- Direct Editing
                { mode = "n", keys = "<leader>v", desc = "+Editing Actions" },
                { mode = "x", keys = "<leader>v", desc = "+Editing Actions" },

                -- Quckfix
                { mode = "n", keys = "<leader>x", desc = "+Loclist/Quickfix" },
                { mode = "n", keys = "<leader>x>", postkeys = "<leader>x" },
                { mode = "n", keys = "<leader>x<", postkeys = "<leader>x" },

                -- Git
                { mode = "n", keys = "<leader>g", desc = "+Git" },
                { mode = "x", keys = "<leader>g", desc = "+Git" },
                { mode = "n", keys = "<leader>gn", postkeys = "<leader>g" },
                { mode = "n", keys = "<leader>gp", postkeys = "<leader>g" },

                -- Code Companion
                { mode = "n", keys = "<leader>c", desc = "+Code Companion" },

                -- LSP
                { mode = "n", keys = "<leader>l", desc = "+LSP" },
                { mode = "x", keys = "<leader>l", desc = "+LSP" },

                -- Iron Repl
                { mode = "n", keys = "<leader>r", desc = "+Iron Repl" },
            },
        }
    end,
}
