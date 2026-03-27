# pi-verbosity-control

NOTE: this is just copied and modified from the original `pi-verbosity-control` extension (https://github.com/ferologics/pi-verbosity-control).

Apply per-model OpenAI `text.verbosity` overrides and cycle the current model's setting from the keyboard.

## Install

```bash
pi install npm:pi-verbosity-control
```

Or via git:

```bash
pi install git:github.com/ferologics/pi-verbosity-control
```

Restart Pi or use `/reload` if you are developing locally.

## What it does

- Reads global config from `~/.pi/agent/verbosity.json`
- Supports model-specific overrides by bare model id (`gpt-5.4`) or exact provider/model (`openai-codex/gpt-5.4`)
- Applies `text.verbosity` to supported OpenAI Responses-family requests right before they are sent
- Shows the active verbosity in Pi's footer via a normal status entry
- Cycles the current model's verbosity with a shortcut and saves it back to the config file

Exact `provider/model` entries win over bare model ids.

## Supported APIs

- `openai-responses`
- `openai-codex-responses`
- `azure-openai-responses`

## Anthropic / Claude

This extension is intentionally OpenAI-only.

Anthropic does not currently expose a direct equivalent to OpenAI `text.verbosity`. Claude's `output_config.effort` is a separate effort/thoroughness control, not a drop-in verbosity setting, so this extension does not map verbosity onto Anthropic models.

## Shortcut

- macOS: `Alt+V`
- Other platforms: `Ctrl+Alt+V`

The shortcut cycles:

```text
low -> medium -> high -> low
```

## Config

Path:

```text
~/.pi/agent/verbosity.json
```

Example:

```json
{
    "models": {
        "gpt-5.4": "low",
        "openai/gpt-5.4": "medium"
    }
}
```

If you edit the file manually while Pi is already running, use `/reload`.

## Notes

- The footer display uses `ctx.ui.setStatus()`, so it appears as a normal Pi footer status entry.
