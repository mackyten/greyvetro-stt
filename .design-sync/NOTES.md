# design-sync notes — Greyvetro Studio UI

Repo-specific context for future syncs of `@greyvetro/ui` → claude.ai/design
project `Greyvetro Studio UI` (`c0de916e-6fc7-41a8-8428-67b30fbab45b`).

## What this sync is
- This repo is a **Vite app**, not a component library. The synced design system
  is a purpose-built primitives package at **`frontend-web/design-system/`**
  (`@greyvetro/ui`) — thin, faithful React wrappers over the brand vocabulary in
  `frontend-web/src/styles.css`. It exists to be synced (and is a reusable kit).
- 22 components across 7 groups (foundations/actions/forms/display/feedback/
  navigation/media). Groups come from a `@category` tag in each component's JSDoc.

## Build / single-source-of-truth
- `cfg.buildCmd = node frontend-web/design-system/build.mjs`. That script
  **re-copies** `frontend-web/src/styles.css` → `design-system/styles.css`
  (rewriting `/fonts/…` → `./fonts/…`) and `frontend-web/public/fonts/*.ttf` →
  `design-system/fonts/`, then runs `tsc`. So the DS stylesheet + fonts can never
  drift from the app — a rebuild regenerates them. Those copies + `dist/` are
  gitignored (`design-system/.gitignore`).
- `cfg.cssEntry = styles.css` (the copied one, inside the package — `cssEntry` is
  bounded to the package dir, so it must live there, not `../src`).
- Converter entry: `--entry ./frontend-web/design-system/dist/index.js`,
  `--node-modules ./frontend-web/node_modules` (has react/react-dom/@types/react).

## Converter env / deps
- Staged scripts in `.ds-sync/`; deps installed there: `esbuild`, `ts-morph`,
  `@types/react`, plus `playwright` (installed with
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` — no bundled Chromium).
- Render check + capture run against **system Google Chrome** via
  `DS_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.
  Export it before `package-validate.mjs` / `package-capture.mjs` / `resync.mjs`.
- npm installs need network — the Bash sandbox blocks it (run with sandbox off, or
  have the user run them).

## Preview overrides (in config.json)
- `Modal` — overlay is `position: fixed`; the preview wraps it in a
  `transform: translateZ(0)` stage so the dialog is captured in-card, not against
  the viewport. `{cardMode: single, viewport: 660x560}`.
- `Menu` — dropdown; `{cardMode: single, viewport: 300x260}`.
- `Banner`, `AudioPlayer` — `{cardMode: column}` (they're wider than a grid cell).
- `AudioPlayer` preview uses a tiny silent-WAV data URI + `autoPlay={false}` so the
  transport renders without audio/network.

## Known render warns
- None outstanding. The two `GRID_OVERFLOW` warns (Banner, AudioPlayer) are
  resolved by the `cardMode: column` overrides above; if they reappear it just
  means the override was dropped.
- `Spinner` is legitimately small (indeterminate loader) — if a `RENDER_THIN`
  warn ever appears for it, it's expected.

## Re-sync risks (what could silently go stale)
- **Adding a component**: create `design-system/src/<Name>.tsx` with a `@category`
  JSDoc tag, export it from `src/index.ts`, author `.design-sync/previews/<Name>.tsx`,
  rebuild + capture + grade. Floor-card components (unauthored) are the standing
  incremental-authoring backlog.
- **styles.css edits in the app** flow into the DS automatically on the next build
  — but if a class an existing primitive relies on is renamed/removed, that
  primitive silently loses styling. After big `styles.css` refactors, re-grade.
- The primitives are **coupled to app class names** (`.generate-btn`, `.voice-row`,
  `.preset-menu`, etc.). Renaming those in the app breaks the matching primitive.
- Grades in `.design-sync/.cache/` are gitignored; verified-state carries via the
  uploaded `_ds_sync.json`. A fresh clone re-verifies from that anchor.
