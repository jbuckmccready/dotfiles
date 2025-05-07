return {
    filetypes = { "python" },
    settings = {
        python = {
            analysis = {
                -- Ignore all files for analysis to exclusively use Ruff for linting
                ignore = { "*" },
            },
            -- This is the relative path to the python interpreter for the virtualenv
            pythonPath = ".venv/bin/python",
        },
        pyright = {
            diagnosticMode = "workspace",
        },
    },
}
