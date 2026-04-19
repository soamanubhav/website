# Website Schema (Preserve for Future Changes)

This repository is a static single-page site with tabbed sections. Future changes should **preserve this schema** unless explicitly requested.

## 1) File structure
- `index.html` → page structure and semantic sections.
- `styles.css` → global theme tokens + all component styles.
- `script.js` → UI behavior, theme state, navigation menus, and interactive widgets.
- `README.md` → project descriptor.

## 2) Top-level HTML schema (`index.html`)
1. `<nav>` with:
   - logo (`.nav-logo`)
   - primary link (`.nav-links a`) for portfolio
   - projects dropdown (`#navProjectsDropdown`)
   - theme toggle button (`#theme-toggle`)
2. Portfolio section order:
   - Hero (`#home`)
   - Experience (`#experience`)
   - Skills (`#skills`)
   - Projects (`#projects`)
   - Education (`#education`)
   - Contact (`#contact`)
   - Footer

## 3) JavaScript schema (`script.js`)
- Theme management:
  - `applyTheme(theme)`
  - localStorage key: `theme`
- Navigation and utility interactions:
  - `showTab(tab)` for internal page sections.
  - `initNavMenu()`, `initQuickActions()`, `initProjectsMenu()`.
  - certificates preview + resume/download interactions.
- Project tool interactions:
  - Personal finance manager setup/render workflow (`initPFMManager`, `renderPFM`, `buildPFMSummary`).

## 4) CSS schema (`styles.css`)
- Global theme tokens defined in `:root` and `[data-theme="light"]`.
- Common layout/component classes (nav, sections, cards, hero, contact, etc.).
- Responsive behavior via media queries for nav, cards, and content grids.

## 5) Compatibility rules for future edits
- Keep existing IDs/classes used by JavaScript stable (`#theme-toggle`, `#portfolio`, `#projectsMenuBtn`, etc.).
- If adding new UI blocks, use additive changes (new classes/IDs) without renaming current hooks.
- Preserve light/dark token strategy and avoid hardcoding colors where tokens exist.

## 6) Safe extension pattern
- Add new section in `index.html` → style it in `styles.css` → wire interactions in `script.js`.
- For project enhancements, prefer additive updates over breaking existing IDs.
- Validate that navigation menus and theme toggle still work after changes.
