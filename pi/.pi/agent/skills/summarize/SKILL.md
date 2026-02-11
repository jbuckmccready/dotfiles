---
name: summarize
description: "Fetch a URL or convert a local file (PDF/DOCX/HTML/etc.) into Markdown using `uvx markitdown`, optionally it can summarize"
---

# Summarize Skill

Turn URLs, PDFs, Word docs, PowerPoints, HTML pages, text files, and more into Markdown so they can be inspected, quoted, and processed like normal text.

`markitdown` can fetch URLs directly; this skill wraps it to make saving + summarizing convenient.

## Tool

- `scripts/to-markdown.ts`

## When to use

Use this skill when you need to:

- pull down a web page as a document-like Markdown representation
- convert binary docs (PDF/DOCX/PPTX) into Markdown for analysis
- quickly produce a short summary of a long document before deeper work

## Quick usage

Run from this skill folder (the folder containing `SKILL.md`).

### Convert a URL or file to Markdown

```bash
uvx markitdown <url-or-path>
```

To write Markdown to a temp file (prints the path), use the wrapper:

```bash
./scripts/to-markdown.ts <url-or-path> --tmp
```

Tip: when summarizing, the script always writes the full converted Markdown to a temp `.md` file and always prints a final hint line with the path.

Write Markdown to a specific file:

```bash
./scripts/to-markdown.ts <url-or-path> --out /tmp/doc.md
```

### Convert + summarize with haiku-4-5 (pass context)

Summaries work best when you provide what you want extracted and the audience/purpose.

```bash
./scripts/to-markdown.ts <url-or-path> --summary --prompt "Summarize focusing on X, for audience Y. Extract Z."
```

Or:

```bash
./scripts/to-markdown.ts <url-or-path> --summary --prompt "Focus on security implications and action items."
```

This will:

1. convert to Markdown via `uvx markitdown`
2. write the full Markdown to a temp `.md` file and print its path as a hint line
3. run `pi --model claude-haiku-4-5` (no-tools, no-session) to summarize using your extra prompt

## Notes

- Requires Bun (`#!/usr/bin/env bun`).
- Requires `uvx markitdown` and `pi` on `PATH`.
