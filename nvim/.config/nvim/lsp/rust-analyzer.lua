return {
    cmd = { "rust-analyzer" },
    filetypes = { "rust" },
    root_markers = { "Cargo.toml", "rust-project.json" },
    settings = {
        ["rust-analyzer"] = {
            rustfmt = {
                -- nightly rust fmt
                extraArgs = { require("config.settings").rust_fmt_extra_args },
            },
            -- increase limit to 1024 for searching across workspace (defaults to only 128)
            workspace = { symbol = { search = { limit = 1024 } } },
            cargo = {
                -- enable all feature flags for opened project
                features = "all",
            },
        },
    },
}
