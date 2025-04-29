-- Snippets.
return {
    {
        "L3MON4D3/LuaSnip",
        keys = {
            {
                "<C-r>s",
                function()
                    require("luasnip.extras.otf").on_the_fly("s")
                end,
                desc = "Insert on-the-fly snippet",
                mode = "i",
            },
        },
        opts = function()
            local types = require("luasnip.util.types")
            return {
                -- Check if the current snippet was deleted.
                delete_check_events = "TextChanged",
                -- Display a cursor-like placeholder in unvisited nodes
                -- of the snippet.
                ext_opts = {
                    [types.insertNode] = {
                        unvisited = {
                            virt_text = { { "|", "Conceal" } },
                            virt_text_pos = "inline",
                        },
                    },
                    [types.exitNode] = {
                        unvisited = {
                            virt_text = { { "|", "Conceal" } },
                            virt_text_pos = "inline",
                        },
                    },
                    [types.choiceNode] = {
                        active = {
                            virt_text = { { "(snippet) choice node", "LspInlayHint" } },
                        },
                    },
                },
            }
        end,
        config = function(_, opts)
            local luasnip = require("luasnip")

            luasnip.setup(opts)

            -- Load snippets under nvim config:
            require("luasnip.loaders.from_vscode").lazy_load({
                paths = vim.fn.stdpath("config") .. "/snippets",
            })
        end,
    },
}
