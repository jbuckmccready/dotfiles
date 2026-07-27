# pi-openai-fast-mode

Toggle OpenAI priority processing for Responses API requests.

This is a minimal source-in-tree adaptation of John Munson's MIT-licensed [`pi-openai-fast-mode`](https://github.com/johncmunson/pi-openai-fast-mode).

## What it does

- Reads global state from `~/.pi/agent/fast-mode.json`
- Adds `service_tier: "priority"` to supported requests while enabled
- Shows `⚡ fast` in Pi's footer when enabled for the current model
- Persists changes made by the command or shortcut

## Supported APIs

- `openai-responses`
- `openai-codex-responses`

## Controls

- `/fast` toggles Fast Mode
- `/fast on` enables Fast Mode
- `/fast off` disables Fast Mode
- `Alt+Shift+F` toggles Fast Mode

## Config

```json
{
    "enabled": false
}
```

Fast Mode starts disabled when the config is missing or invalid. Disabling it stops this extension from adding a service tier. It does not remove a service tier supplied by another extension or provider configuration.
