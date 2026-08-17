# Subagent extension

This Pi extension adds one `subagent` tool. It delegates tasks to isolated `pi`
processes.

## Usage

```json
{
  "task": "Review the authentication changes and report any bugs",
  "mode": "spawn"
}
```

For independent tasks, one call can run up to eight subagents with at most four
running at once:

```json
{
  "tasks": [
    { "task": "Review the authentication changes" },
    { "task": "Run the relevant tests and report failures" }
  ],
  "mode": "spawn"
}
```

Set exactly one of `task` or `tasks`.

`mode` is optional:

- `spawn` (default) starts a fresh child session.
- `fork` gives the child a snapshot of the current session as context.

Each child inherits the caller's current provider, model, thinking level, and
active tool allowlist. Tasks must provide any other context the child needs when
using `spawn`.

## Safety

The extension limits recursive delegation with `--subagent-max-depth`. The
default maximum depth is three delegation levels. Set it through the CLI or
the `PI_SUBAGENT_MAX_DEPTH` environment variable.

## Rendering

The TUI renderer shows each task, delegation mode, streamed tool calls and
assistant text, final status, and per-run and total usage.

## Files

- `index.ts` — tool definition, depth guard, and execution flow
- `runner.ts` — child process spawning, inherited model settings, and streaming
- `types.ts` — shared result and display helpers
- `render.ts` — TUI rendering
