return {
    "nvim-lualine/lualine.nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    opts = function()
        local spinner_symbols = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" }

        -- codecompanion status component
        local codecompanion_component = function()
            local component = require("lualine.component"):extend()

            component.processing = false
            component.spinner_index = 1

            local spinner_symbols_len = 10

            -- Initializer
            function component:init(options)
                component.super.init(self, options)

                local group = vim.api.nvim_create_augroup("CodeCompanionHooks", {})

                vim.api.nvim_create_autocmd({ "User" }, {
                    pattern = "CodeCompanionRequest*",
                    group = group,
                    callback = function(request)
                        if request.match == "CodeCompanionRequestStarted" then
                            self.processing = true
                        elseif request.match == "CodeCompanionRequestFinished" then
                            self.processing = false
                        end
                    end,
                })
            end

            -- Function that runs every time statusline is updated
            function component:update_status()
                if self.processing then
                    self.spinner_index = (self.spinner_index % spinner_symbols_len) + 1
                    return "AI " .. spinner_symbols[self.spinner_index]
                else
                    return nil
                end
            end

            return component
        end

        -- lsp status component
        local lsp_status = {
            "lsp_status",
            icon = "",
            symbols = {
                -- Standard unicode symbols to cycle through for LSP progress:
                spinner = spinner_symbols,
                -- Standard unicode symbol for when LSP is done:
                done = "✓",
                -- Delimiter inserted between LSP names:
                separator = "|",
            },
            -- List of LSP names to ignore (e.g., `null-ls`):
            ignore_lsp = { "copilot" },
        }

        return {
            options = {
                icons_enabled = true,
                theme = "auto",
                component_separators = "|",
                section_separators = "",
                disabled_filetypes = {
                    statusline = {},
                    winbar = {},
                },
                ignore_focus = {},
                always_divide_middle = true,
                globalstatus = false,
                refresh = {
                    statusline = 500,
                    tabline = 500,
                    winbar = 500,
                },
            },
            sections = {
                lualine_a = { "mode" },
                lualine_b = { "branch", "diff", "diagnostics" },
                -- path = 2 for absolute file path
                lualine_c = { { "filename", path = 2 } },
                lualine_x = {
                    codecompanion_component(),
                    lsp_status,
                    "encoding",
                    "fileformat",
                    "filetype",
                },
                lualine_y = { "progress" },
                lualine_z = { "location" },
            },
            inactive_sections = {
                lualine_a = {},
                lualine_b = {},
                lualine_c = { "filename" },
                lualine_d = {},
                lualine_x = { "location" },
                lualine_y = {},
                lualine_z = {},
            },
            tabline = {},
            winbar = {},
            inactive_winbar = {},
            extensions = {},
        }
    end,
}
