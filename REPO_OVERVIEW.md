# Repository Overview

## What this repository is
This repository currently hosts a **single-page personal portfolio website** for Anubhav Soam, built as a static site.

## Current file layout
- `index.html` — Main page markup and section content (hero, experience, skills, projects, education, contact, footer).
- `styles.css` — Centralized styling, theming tokens, component styles, and responsive behavior.
- `WEBSITE_SCHEMA.md` — Intended architectural schema and future-change constraints.
- `README.md` — Minimal project title placeholder.

## Observations
1. The implementation is currently **HTML + CSS only** in this repository state.
2. The page is structured as a single-page portfolio with linked subpages (Projects and Blog) in the present `index.html`.
3. `script.js` handles client-side interactions (theme, menus, previews, and finance tool behavior).
4. The CSS uses design tokens in `:root` and `[data-theme="light"]` and styles detailed sections/components for a polished visual layout.

## How to run locally
Because it is static, you can open `index.html` directly in a browser, or serve it with a simple local HTTP server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Suggested next improvements
- Expand `README.md` with setup instructions, deployment notes, and section map.
- Keep `WEBSITE_SCHEMA.md` aligned with the implemented structure as UI behaviors evolve.
- Introduce lightweight validation (HTML/CSS linting) to reduce regressions.
