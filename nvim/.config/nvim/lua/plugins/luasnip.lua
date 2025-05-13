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
            local ls = require("luasnip")

            ls.setup(opts)

            -- Add custom snippets
            -- NOTE: much of this idea for organization is copied from here: https://github.com/linkarzu/dotfiles-latest/blob/8011c0fcf1e23e08ebd46a8079c38efeb75d5dec/neovim/neobean/lua/plugins/luasnip.lua

            -- Add prefix ";" to each one of my snippets using the extend_decorator
            -- I use this in combination with blink.cmp. This way I don't have to use
            -- the transform_items function in blink.cmp that removes the ";" at the
            -- beginning of each snippet. I added this because snippets that start with
            -- a symbol like ```bash aren't having their ";" removed
            -- https://github.com/L3MON4D3/LuaSnip/discussions/895
            -- NOTE: THis extend_decorator works great, but I also tried to add the ";"
            -- prefix to all of the snippets loaded from friendly-snippets, but I was
            -- unable to do so, so I still have to use the transform_items in blink.cmp
            local extend_decorator = require("luasnip.util.extend_decorator")
            -- Create trigger transformation function
            local function auto_semicolon(context)
                if type(context) == "string" then
                    return { trig = ";" .. context }
                end
                return vim.tbl_extend("keep", { trig = ";" .. context.trig }, context)
            end
            -- Register and apply decorator properly
            extend_decorator.register(ls.s, {
                arg_indx = 1,
                extend = function(original)
                    return auto_semicolon(original)
                end,
            })
            local s = extend_decorator.apply(ls.s, {})

            -- local s = ls.snippet
            local t = ls.text_node
            local i = ls.insert_node
            local f = ls.function_node

            -- Get content from clipboard
            local function clipboard()
                -- split on newline in case clipboard is multiline, required by luasnip api
                local lines = vim.split(vim.fn.getreg("+"), "\n")
                -- Remove last line if empty (for convenience in common case if yanked with yy)
                if #lines > 0 and lines[#lines] == "" then
                    table.remove(lines)
                end
                return lines
            end

            local function date_now()
                return os.date("%Y-%m-%d")
            end

            local function create_code_block_snippet(lang)
                return s({
                    trig = lang,
                    name = "Codeblock",
                    desc = lang .. " codeblock",
                }, {
                    t({ "```" .. lang, "" }),
                    i(1, "code"),
                    t({ "", "```" }),
                })
            end

            -- Define languages for code blocks
            local languages = {
                "sh",
                "bash",
                "cpp",
                "go",
                "json",
                "lua",
                "markdown_inline",
                "markdown",
                "python",
                "regex",
                "rust",
                "sql",
                "txt",
                "yaml",
            }

            local snippets = {}

            for _, lang in ipairs(languages) do
                table.insert(snippets, create_code_block_snippet(lang))
            end

            local function create_quote_block_snippet(quote_kind)
                return s({
                    trig = quote_kind,
                    name = "Quote block",
                    desc = quote_kind .. " quote block",
                }, {
                    t({ "> [!" .. string.upper(quote_kind) .. "]", "> " }),
                    i(1, "quote"),
                })
            end

            -- Define kinds for quote blocks
            local quote_kinds = {
                "note",
                "tip",
                "important",
                "warning",
                "caution",
            }

            for _, quote_kind in ipairs(quote_kinds) do
                table.insert(snippets, create_quote_block_snippet(quote_kind))
            end

            -- Markdown link snippet
            table.insert(
                snippets,
                s({
                    trig = "link",
                    name = "Markdown Link",
                    desc = "Markdown Link",
                }, {
                    t("["),
                    i(1, "text"),
                    t("]("),
                    i(2, "url"),
                    t(") "),
                    i(0),
                })
            )

            -- Paste clipboard contents in link section, move cursor to ()
            table.insert(
                snippets,
                s({
                    trig = "linkc",
                    name = "Paste clipboard as .md link",
                    desc = "Paste clipboard as .md link",
                }, {
                    t("["),
                    i(1, "text"),
                    t("]("),
                    f(clipboard, {}),
                    t(")"),
                })
            )

            table.insert(
                snippets,
                s({
                    trig = "datenow",
                    name = "Date Now",
                    desc = "Date Now",
                }, {
                    f(date_now, {}),
                })
            )

            ls.add_snippets("markdown", snippets)
            -- Added for codecompanion as well since markdown is common for input
            ls.add_snippets("codecompanion", snippets)
        end,
    },
}
