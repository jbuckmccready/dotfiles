# Attribution

Originally based on: https://github.com/mjakl/pi-subagent

# Subagent extension

This Pi extension adds a `subagent` tool that delegates work to specialized agents by spawning isolated `pi` processes.

## What it supports

- Single delegation:
  - `{ agent: "name", task: "..." }`
- Parallel delegation:
  - `{ tasks: [{ agent: "name", task: "..." }, ...] }`
- Context modes:
  - `spawn` (default): child gets only the provided task prompt
  - `fork`: child gets a forked snapshot of the current session plus the task prompt

## Agent discovery

Agents are discovered from:

- User agents: `~/.pi/agent/agents/*.md`
- Project agents: nearest `.pi/agents/*.md` while walking up from the current working directory

When both define the same agent name, the project agent wins.

## Safety guards

The extension includes a few runtime protections:

- Maximum parallel task limit
- Delegation depth limit
- Cycle prevention using the delegation stack
- Optional confirmation before running project-local agents

## Rendering behavior

The TUI renderer shows:

- the delegated agent name and source (`user` or `project`)
- the delegation mode (`spawn` or `fork`)
- streamed tool-call previews and assistant text
- per-run usage and total usage for parallel runs

The tool result returned to the parent call contains the final assistant text for each run, while the renderer can show the fuller interleaved transcript.

## Files

- `index.ts` — tool definition, validation, and execution flow
- `agents.ts` — agent discovery and parsing
- `runner.ts` — child process spawning and streaming
- `types.ts` — shared types and display helpers
- `render.ts` — TUI rendering for calls and results
