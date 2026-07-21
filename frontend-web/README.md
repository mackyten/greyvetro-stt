# Greyvetro Studio — Web Frontend

React (TypeScript + Vite) web version of the Greyvetro Studio app (the primary
surface for the Studio multimedia features — see the root
[`CLAUDE.md`](../CLAUDE.md)). Talks to the same .NET backend on
`http://localhost:5050` — the ElevenLabs API key never reaches the browser.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

The backend must be running first (from `../backend/`):

```bash
dotnet run --project Greyvetro.API
```

Override the API base with a `.env` file if needed:

```
VITE_API_BASE=http://localhost:5050
```

## Structure

```
src/
├── core/                  # api.ts (HTTP layer), types.ts, useTheme.ts, toast.tsx (snackbars)
├── features/tts/          # Composer + AudioPlayer
├── features/voices/       # VoicePickerModal + CreateVoiceModal (record/upload → clone)
├── features/gallery/      # GalleryScreen + galleryRepo (IndexedDB: metadata + audio blobs)
├── features/projects/     # projectRepo, ProjectSelect ("Saving to" in composer), ProjectNameModal
├── features/presets/      # PresetsScreen, PresetEditorModal, SavePresetModal, presetRepo (localStorage)
└── features/usage/        # UsageCard (sidebar credits)
```

Styling is plain CSS with brand tokens in `src/styles.css` (light + dark via
`data-theme` on `<html>`; toggle persists to localStorage, follows system by
default). Fonts: Manrope + JetBrains Mono, copied from `../frontend/fonts/`.

## Feature parity vs. the Flutter app

- **Studio composer** — script editor, voice picker (search + gender filter +
  refresh), the four voice settings **plus a model dropdown** (Multilingual v2 /
  Eleven v3 / Turbo v2.5 / Flash v2.5 — v3 is the expressive one and reads
  `[excited]`-style audio tags in the script), gradient Generate, review modal.
- **Take workflow** — generating produces an in-memory, **unsaved take** and
  opens the **Review take modal** (`TakeReviewModal.tsx`): play/download, then
  **Save to \<project\>** (files it in the gallery), **Regenerate** (same
  script/settings, replaces the take), or **Discard**. Closing the modal keeps
  the take unsaved — a "Review take" pill next to Generate reopens it. Editing
  the script and generating again also replaces the take. Nothing is stored
  until you save.
- **Gallery** — holds only the takes you saved (audio + metadata in IndexedDB,
  local to this browser). Cards replay, download, delete, "Use these settings"
  (keeps composer text), "Save as preset", and "Edit & regenerate" (loads text +
  voice + settings back into the composer).
- **Presets** — voice + settings bundles in localStorage, same duplicate guard
  as Flutter (`findMatchingPreset`, name-independent). Save from the composer's
  voice-settings card or any gallery card; Use / Edit / Delete on the Presets tab.
- **Create my voice** — record samples (MediaRecorder) or upload audio files →
  `POST /voices/clone`; warns when the plan can't clone. Requires a paid
  ElevenLabs plan to actually clone.
- **Projects** (web-only, not in the Flutter app) — group clips per video/campaign.
  The composer has a "Project: <name> ▾" selector (persisted) that sets the save
  target for takes; saved clips get an auto-title from the script. The Gallery has a project chip row
  (All / Unsorted / each project / + New); clips can be renamed inline (click the
  title), moved between projects, and downloaded individually as
  `<project>-<clip>.mp3` or per-view as a zip (`jszip`) with clip-named files.
  Deleting a project keeps its clips in Unsorted. Data: a `projects` store in the
  same IndexedDB (v2); clips carry optional `projectId` + `title`.
- **Dark mode**, usage credits, brand theme — all included.

Storage caveat: gallery audio and presets live in the browser profile
(IndexedDB / localStorage) — clearing site data deletes them, unlike the
Flutter app's documents-directory storage.
