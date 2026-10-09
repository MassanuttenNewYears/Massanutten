Last updated: 2026-10-09

# Knowledge Base

## Overview

`massanutten` is a static GitHub Pages site for the org `MassanuttenNewYears` (remote: `https://github.com/MassanuttenNewYears/Massanutten.git`, branch `main`). Currently a single page showing an ASCII penguin wearing a hat marked "NY".

- **How to run:** open `index.html` in a browser. No build step. Deploy via GitHub Pages (Settings > Pages > `main` branch, root). Expected URL: `https://massanuttennewyears.github.io/Massanutten/`.

## Architecture

- `index.html`: the whole site. Inline CSS, ASCII art inside a `<pre>`, and an `<h1>`.
- `.cursor/rules/knowledge-base.mdc`: always-applied rule enforcing the KB workflow.
- `kb/knowledge_base.md`: this file.

## Key design decisions

- Plain static HTML, no framework or build tooling, so GitHub Pages serves it as-is.
- ASCII art lives in a `<pre>`; `<` and `>` must be written as `&lt;` / `&gt;` there. Uses monospace font; the `◉` eye characters require UTF-8 (`<meta charset>` is set).
- Remote uses HTTPS (via `gh auth login`) because SSH key auth failed.

## Shortcuts / conventions

- **User-facing controls:** none.
- **Code conventions:** keep the site dependency-free; inline styles for now.
- **Process:** all changes follow the KB workflow in `.cursor/rules/knowledge-base.mdc`.

## Known limitations

- Penguin ASCII art is rough and not visually verified in a browser.
- Initial commit may not be pushed yet (earlier push failed because there were no commits).
- Unconfirmed whether Pages is enabled in the repo settings.

## Update log

- 2026-10-09: Added `index.html` with ASCII penguin wearing an "NY" hat as the initial Pages site; documented git remote/Pages setup.
- 2026-10-09: Initial KB created (repo was empty; sections are placeholders, plus the always-applied KB rule in `.cursor/rules/knowledge-base.mdc`).
