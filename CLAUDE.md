# Greyvetro TTS

A text-to-speech app built on ElevenLabs. .NET backend + Flutter desktop frontend
+ React web frontend. Built for personal/company use with brand-aligned styling.

> **Planned expansion — Greyvetro Studio (multimedia creation tool).** The app is
> set to evolve into an AI video assembler (Claude script generation → ElevenLabs
> voiceover → timestamped STT transcript → storyboard scenes → ffmpeg mp4 render),
> including a repo rename. Full plan, workflow mapping, and build phases:
> **[docs/multimedia-studio-plan.md](docs/multimedia-studio-plan.md)**.

---

## Architecture

```
greyvetro-tts/
├── backend/                       # .NET 10 — Clean Architecture
│   ├── Greyvetro.Domain/          # Entities + interfaces (no dependencies)
│   ├── Greyvetro.Application/      # Feature handlers (CQRS-lite: Command/Query + Handler)
│   ├── Greyvetro.Infrastructure/  # ElevenLabs client impl, DI wiring
│   └── Greyvetro.API/             # Minimal API endpoints (Program.cs)
├── frontend/                      # Flutter 3.44 (desktop: macOS + Windows)
│   └── lib/
│       ├── core/                  # api_client.dart — HTTP layer
│       ├── features/tts/          # generation screen
│       └── features/voices/       # voice model + picker
└── frontend-web/                  # React 19 + TypeScript + Vite (web)
    └── src/
        ├── core/                  # api.ts, types.ts, useTheme.ts
        └── features/              # tts/ (Composer, AudioPlayer), voices/ (picker modal), usage/
```

### Backend conventions
- **Dependency rule**: Domain ← Application ← Infrastructure ← API. Never invert.
- Each feature is a `record` Command/Query + a `Handler` class with `HandleAsync`. Register handlers in `Infrastructure/DependencyInjection/ServiceCollectionExtensions.cs`.
- The ElevenLabs SDK type `Voice` collides with our domain `Voice`; in `ElevenLabsService` we fully-qualify `Domain.Entities.Voice`. Keep that pattern.
- Endpoints live in `Program.cs` as minimal APIs. Keep them thin — delegate to handlers.
- Target framework: `net10.0`. C# implicit usings + nullable enabled.

### Frontend conventions
- Feature-first folders under `lib/features/`. Shared infra under `lib/core/`.
- Currently uses plain `setState` (no state-management package). Keep it simple unless complexity demands `provider`/`riverpod` — decide before adding.
- Audio playback uses the cross-platform `audioplayers` package (macOS + Windows). The shared `AudioPlayer` (`core/audio_player.dart`) exposes `position`/`duration`/`seek` on top of play/stop; the `AudioScrubber` widget (`core/audio_scrubber.dart`) renders a seek bar for the active track.

### Web frontend conventions (`frontend-web/`)
- Mirrors the Flutter feature-first layout: `src/core/` (API client, types, theme hook) + `src/features/`.
- Plain React hooks/`useState`, no state-management package — same "keep it simple" rule as Flutter.
- Styling is plain CSS with brand tokens as CSS variables in `src/styles.css`; dark mode via `data-theme` on `<html>`, persisted to localStorage, follows system by default. Fonts copied from `frontend/fonts/`.
- Transient confirmations use **snackbars** (`core/toast.tsx`: `ToastProvider` wraps `App` in `main.tsx`; call `useToast()(message, variant?)`, variants success/error/info, bottom-center, auto-dismiss ~3s) — never inline notice banners. Inline `error-banner` remains only for persistent contextual errors (e.g. generation failures next to the Generate button).
- Full feature parity with the Flutter app: composer, voice picker, voice settings, playback/download, usage card, dark mode, **Gallery** (IndexedDB stores metadata + audio blobs per generation, browser-local), **Presets** (localStorage JSON index, same name-independent duplicate guard), and **Create-my-voice** (MediaRecorder recording or file upload → `/voices/clone`). Cross-screen flows ("Use these settings", "Edit & regenerate", preset "Use") pass a `Draft` object down from `App`; the composer stays mounted across tab switches so its state persists.
- **Take workflow**: generating creates an in-memory unsaved take (`Take` in `Composer.tsx`) and opens the **Review take modal** (`features/tts/TakeReviewModal.tsx`) — nothing is persisted until the user clicks **Save to \<project\>** there (other options: Regenerate, Discard). Closing the modal keeps the take; a "Review take" pill in the rail reopens it. The gallery holds only saved takes.
- **Projects** (web-only): clips group into projects for video work. Composer "Project" selector (`features/projects/ProjectSelect.tsx`, active id in localStorage) sets the save target; saved takes get an auto-title. Gallery chip row filters by project and offers inline clip rename, move-to-project, per-clip `<project>-<clip>.mp3` downloads, and a per-view zip export (`jszip`). Deleting a project moves its clips to Unsorted. IndexedDB is at **version 2** (`core/db.ts`: `gallery` + `projects` stores) — bump the version there when adding stores.

---

## Running locally

**Backend** (from `backend/`):
```bash
dotnet run --project Greyvetro.API     # serves http://localhost:5050
```
Requires the ElevenLabs API key in the environment variable `ElevenLabs__ApiKey`
(the double underscore maps to the config key `ElevenLabs:ApiKey`). On macOS,
export it from `~/.zshrc`:
```bash
export ElevenLabs__ApiKey="sk_..."
```
Alternatively, put it in the git-ignored `Greyvetro.API/appsettings.json` under
`{ "ElevenLabs": { "ApiKey": "sk_..." } }` — .NET reads either. Keep the key out
of any committed file.

**Desktop frontend** (from `frontend/`):
```bash
flutter run -d macos
```

**Web frontend** (from `frontend-web/`):
```bash
npm install
npm run dev        # http://localhost:5173
```

The API key lives **only** on the backend. Neither frontend ever sees it. Keep it that way.

---

## ElevenLabs notes (important)

- **Free tier** = ~10,000 credits/month, access to premade voices + the community Voice Library. `GetVoicesAsync` currently filters to `premade` and `cloned` categories.
- **Voice cloning (Instant Voice Cloning) requires a paid plan** (Starter+). This conflicts with a "free-only" goal — see Roadmap §2. The `/voices/clone` endpoint exists but will fail on a free account.
- **Usage/credits** come from the user subscription endpoint (`character_count` / `character_limit`). Not yet wired up — see Roadmap §3.
- Models: default `eleven_multilingual_v2`. `eleven_turbo_v2_5` / `eleven_flash_v2_5` cost fewer credits; **`eleven_v3`** is the expressive model and reads inline audio tags (`[excited]`, `[whispers]`, `[laughs]`, `[shouts]`) in the script — confirmed working on this account. The web frontend exposes model choice (Voice settings → Model, sent as `modelId` through `/tts`); the Flutter app still hardcodes multilingual v2.
- Expressiveness: flat output usually means Stability too high / Style at 0. Energetic read ≈ Stability 0.3, Style 0.5–0.7 (v2), or switch to `eleven_v3` with audio tags for strong emotion.

---

## Brand & UI

Company palette — the UI should feel modern, soft, and on-brand:
- **Grey** — neutral base / surfaces / text
- **Baby blue** — primary accent
- **Baby pink** — secondary accent

Proposed tokens (tune during implementation):
| Token        | Hex       | Use                         |
|--------------|-----------|-----------------------------|
| Baby blue    | `#A8D8EA` | primary buttons, selection  |
| Baby pink    | `#FCD5D5` | secondary, highlights       |
| Soft grey    | `#F4F5F7` | background / surfaces        |
| Slate grey   | `#5B6470` | body text                    |
| Deep grey    | `#2E343D` | headings                     |

Aim for rounded corners, gentle shadows, generous spacing, and a clean sans-serif.

> **Implemented palette (supersedes the proposed tokens above).** The full
> desktop redesign lives in `core/theme.dart`. Fonts: **Manrope** (UI) +
> **JetBrains Mono** (numbers/meta), bundled under `frontend/fonts/`. Screens
> read **theme-aware** tokens via `BrandColors` / `context.brand` (not the flat
> `AppColors.*` constants, which are the light-mode fallback). Refined values:
> background `#EEF1F5`, surface `#FFFFFF`, blue `#8FD0E8` / deep `#3E9AC4`,
> pink `#FBCAD4` / deep `#E58D9E`, hero blue→pink gradient; dark bg `#12151A`,
> surface `#1A1F26`; semantic `#E0607A` / `#F0C070` / `#2FA96A`. Light **and**
> dark themes; toggle persists (`core/theme_controller.dart`, `ThemeScope`).

---

## Roadmap

1. ✅ **Free voices only** — `GetVoicesAsync` returns premade (free) + cloned; picker has search + gender filter, plus manual refresh (refresh button, pull-to-refresh, and retry-on-error) to re-fetch the list, e.g. after upgrading a plan or cloning a voice (`voices_screen.dart`, `voice_model.dart` parses labels).
2. ✅ **Use my own voice** — `CreateVoiceScreen` (opened via "Create my voice" in the picker): record (package `record`) or upload (`file_picker`) samples → `POST /voices/clone` (multipart) → returned voice is selected and shows under "My Voices". Warns if `usage.canCloneVoices` is false. macOS mic + user-selected-file entitlements added; `NSMicrophoneUsageDescription` set. Requires a paid ElevenLabs plan to actually clone. Note: the upload picker uses `FileType.custom` with an explicit `allowedExtensions` list (`m4a, mp3, wav, …`) — `FileType.audio` greys out `.m4a` on macOS (the format the in-app recorder produces).
3. ✅ **Credit tracking** — backend `GET /usage` (subscription endpoint); `UsageBadge` in the **sidebar footer** (sidebar-card variant; remaining credits + gradient bar; refreshes after each generation via the composer's `onGenerated` callback).
4. ✅ **Modern brand UI** — `core/theme.dart` palette (grey / baby blue / baby pink); all screens restyled.
5. ✅ **Local gallery** — `GalleryRepository` persists audio + metadata under app documents dir; `GalleryScreen` (Gallery tab) replays, shows text, edit & regenerate, export, delete. Shared `AudioPlayer` (`core/audio_player.dart`). Navigation via `HomeShell`.
6. ✅ **Desktop UI/UX overhaul** — full redesign from a Claude Design spec, built in 6 phases. **Left sidebar** nav replaces the bottom bar (`features/home/app_sidebar.dart`; responsive labelled 212px / 64px icon rail, hosts logo + nav + credit card + theme toggle). Composer is the **"1a Studio"** editor-forward layout (big script editor + right rail: voice / collapsible settings / gradient Generate / result), reflows to one column below 880px. Gallery & Presets use a **responsive masonry grid** (3/2/1-up). Voice Picker is a shared **centered modal** (`features/voices/voice_picker.dart`, used by composer + preset editor). Create-my-voice & preset editor restyled. `AudioScrubber` has a gradient seek track. Manrope/JetBrains Mono fonts; **dark mode** throughout.

7. **Greyvetro Studio — multimedia creation tool** (planned, not started) — see
   [docs/multimedia-studio-plan.md](docs/multimedia-studio-plan.md) for the full
   plan: rename → STT endpoint (ElevenLabs Scribe) → Claude script/scene
   generation → storyboard UI on top of Projects → ffmpeg render.

### Candidate additions
- ✅ **Voice settings** — "Voice settings" card in the composer: **Stability**, **Similarity**, **Style** sliders + a **Speaker boost** toggle (on by default — strongest lever for cloned-voice likeness). All four flow through `TtsRequest` → `VoiceSettings`, are stored per gallery item, and restored on edit/regenerate. (Flutter still hardcodes `eleven_multilingual_v2`; the **web** frontend has a Model dropdown — v2 / Eleven v3 / Turbo / Flash — carried through `/tts` `modelId`, gallery items, and presets.)
- **Voice preview** playback before selecting.
- **Favorites** for voices.
- **Quota-exceeded** friendly error handling.
- ✅ **Dark mode** — light/dark themes in `core/theme.dart`; sidebar toggle, persisted via `core/theme_controller.dart` (`ThemeController` + `ThemeScope`, follows system by default).
- ✅ **Cross-platform audio playback** — replaced macOS `afplay` with the `audioplayers` package (works on macOS + Windows).
- ✅ **Seek bar / scrubber** — `AudioScrubber` (`core/audio_scrubber.dart`) shows an interactive progress bar (drag/click to seek) for the active track in both the Gallery cards and the composer preview.
- ✅ **Presets** — save a named bundle of voice + settings (stability / similarity / style / speaker boost) and re-apply it. `features/presets/` (`Preset` + `PresetRepository`, JSON index in app docs dir, no audio).
  - **Create**: composer Voice-settings card "Save as preset" + "Apply preset" menu; each Gallery card's overflow menu offers "Use these settings" (loads into composer, keeps text) and "Save as preset". Applying uses `TtsScreenState.applySettings`.
  - **Presets tab** (`PresetsScreen`, 3rd nav destination): lists presets with a settings summary; **Use** applies to the composer, **Edit** opens `PresetEditorScreen` (name + voice via the voice picker + the four settings), **Delete** removes it.
  - **Duplicate guard**: saving is blocked when another preset already has identical settings (voice + the four values, name-independent) — `PresetRepository.findMatching` / `Preset.hasSameSettings`. Enforced in the composer, gallery, and editor.
  - Changes anywhere call `onPresetsChanged` → `HomeShell._refreshPresetsEverywhere` keeps the composer menu and Presets tab in sync.

---

## Known issues / tech debt
- CORS is wide open (`AllowAnyOrigin`) — fine for local dev, revisit if ever hosted.
- **Port = 5050** everywhere. Source of truth is `appsettings.json` `"Urls": "http://localhost:5050"` (used when the VS Code debugger runs the built DLL). `launchSettings.json` (used by `dotnet run`) and the Flutter `ApiClient._base` are aligned to match. Note macOS AirPlay occupies :5000, so don't use that. ~~`Console.WriteLine` logging~~ (fixed: `ILogger`).

---

## Workflow with Claude
- Build features **one at a time**; confirm scope before large changes.
- Keep the dependency rule and feature-folder conventions intact.
- Update this file's Roadmap as items ship.
