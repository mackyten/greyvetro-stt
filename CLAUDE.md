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
- **Projects** (web-only): clips group into projects for video work. Composer "Project" selector (`features/projects/ProjectSelect.tsx`, active id in localStorage) sets the save target; saved takes get an auto-title. Gallery chip row filters by project and offers inline clip rename, move-to-project, per-clip `<project>-<clip>.mp3` downloads, and a per-view zip export (`jszip`). Deleting a project moves its clips to Unsorted (and deletes its storyboard scenes). IndexedDB is at **version 5** (`core/db.ts`: `gallery` + `projects` + `scenes` + `timelines` + `timelineAssets` stores) — bump the version there when adding stores.

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

For AI script/scene generation (Greyvetro Studio Phase 2), also export
`GEMINI_APIKEY` (free key from https://aistudio.google.com/apikey). Optional —
`/script` endpoints return 503 with instructions until it is set.

Video export (`POST /render`) needs **ffmpeg** on the backend machine:
`brew install ffmpeg`. Optional — the endpoint returns 503 with the install
hint until it is present.

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

7. **Greyvetro Studio — multimedia creation tool** (in progress) — see
   [docs/multimedia-studio-plan.md](docs/multimedia-studio-plan.md) for the full
   plan: rename → STT endpoint (ElevenLabs Scribe) → Claude script/scene
   generation → storyboard UI on top of Projects → ffmpeg render.
   - ✅ **Phase 1 — STT**: `POST /stt` (multipart audio → ElevenLabs Scribe
     `scribe_v1`, word-level timestamps; Scribe is called through a typed
     `HttpClient` in `ElevenLabsService` because the SDK has no STT endpoint).
     Web gallery cards have a "📝 Transcribe" chip; the transcript persists on
     the `GalleryItem` in IndexedDB (no version bump needed) and opens in
     `features/stt/TranscriptModal.tsx` (text / word-timings views, copy).
     The ElevenLabs API key must have the **`speech_to_text` permission**
     (scoped keys return 401 `missing_permissions` otherwise) — enabled on the
     current key 2026-07-17; verified end-to-end with word timestamps.
   - ✅ **Phase 2 — Script generation (Gemini, not Anthropic)**: the plan's
     Anthropic-API choice was superseded 2026-07-17 (user wanted a free tier).
     `POST /script` (topic → TTS-ready script) and `POST /script/scenes`
     (transcript → scene JSON via Gemini structured output) call
     `generateContent` on **`gemini-flash-latest`** (`GEMINI_MODEL` overrides;
     use the rolling alias — pinned versions like `gemini-2.5-flash` get
     retired for new API keys, returning 404)
     through a named `HttpClient` in `Greyvetro.Infrastructure/Gemini/GeminiService.cs`.
     Verified end-to-end 2026-07-17: topic → script → `/tts` voiceover →
     `/stt` transcript → 5 contiguous scenes with style-consistent prompts.
     Note: this Gemini key also has access to image models
     (`gemini-3-pro-image`, `nano-banana-pro-preview`) — relevant to Phase 5
     automated image generation.
     `GEMINI_APIKEY` env var (free at https://aistudio.google.com/apikey) is
     **optional** — endpoints return 503 with instructions until set. Web UI:
     composer "✨ Write with AI" chip (`features/script/ScriptAssistModal.tsx`)
     and a "🎬 Scene prompts" view in the TranscriptModal with per-scene
     copy-prompt buttons for Flow.
   - ✅ **Phase 3 — Storyboard**: new **Storyboard** nav tab
     (`features/storyboard/`): per-project storyboard generated from a chosen
     voiceover clip (auto-transcribes via `/stt` when the clip has no
     transcript, then `/script/scenes`). Scene cards with per-scene image
     upload/replace, copy-prompt, drag-to-reorder (durations keep, start times
     re-anchor), delete-with-gap-fill, regenerate; browser-side **preview**
     swaps images on the voiceover timeline (`StoryboardPreview.tsx`).
     IndexedDB is now **version 3** (`core/db.ts`: + `scenes` store;
     `sceneRepo.ts` stores metadata + image blobs). `deleteProject` also
     removes the project's scenes.
   - ✅ **Phase 4 — Render**: Storyboard "⬇ Export mp4" → `POST /render`
     (multipart: voiceover + scenes JSON + per-scene frame images) →
     `Infrastructure/Ffmpeg/FfmpegVideoRenderer.cs` drives ffmpeg (looped
     stills scaled/cropped to **1080×1920 30fps**, dark placeholder for
     imageless scenes, concat + AAC audio, `-shortest`, faststart) → download
     `<project>.mp4`. **Captions are burned in client-side**
     (`features/storyboard/composite.ts`: canvas cover-fit + wrapped Manrope
     caption box) — Homebrew's ffmpeg 8 has **no drawtext filter** (built
     without freetype), so never rely on drawtext server-side. ffmpeg is a
     backend runtime dependency (`brew install ffmpeg`; probed at
     `/opt/homebrew/bin` → `/usr/local/bin` → PATH, 503 with install hint if
     missing). Verified: 5-scene render → h264/aac 1080×1920@30, correct
     cover-crop + placeholder frames.
   - 🚧 **Phase 5 — Timeline Editor** (in progress): replace the linear
     Storyboard→Render step with a CapCut-style multi-track non-linear editor
     (layered video/photo/audio, trim, crop, transform, transitions, Ken Burns,
     multi-track audio). Full corrected architecture plan — data model, backend
     C# `filter_complex` compiler, caption-overlay strategy, phased roadmap —
     lives in **[docs/timeline-editor-plan.md](docs/timeline-editor-plan.md)**.
     Non-negotiables it locks in (keep these when building): the ffmpeg compiler
     is **pure C# in `Greyvetro.Infrastructure`**, driven by a structured
     `Timeline` DTO (never client-emitted ffmpeg strings); captions stay
     browser-rendered as **alpha-PNG overlay layers** (no server drawtext);
     media blobs persist in IndexedDB (never blob URLs); v1 is **stills-first**
     (video-clip ingestion deferred). ffmpeg build gate passed 2026-07-17 —
     `zoompan`/`xfade`/`acrossfade`/`overlay`/`amix`/`afade`/`adelay` all present.
     - ✅ **TL Phase 1 — Model + read-only timeline + regression**: `Timeline`/
       `Track`/`Clip`/`MediaAsset` records (`Domain/Entities/Timeline.cs`) mirrored
       by TS (`features/timeline/model/types.ts`). Pure `FilterGraphCompiler`
       (`Infrastructure/Ffmpeg/`, xUnit `Greyvetro.Tests`) emits an `FfmpegPlan`;
       `FfmpegTimelineRenderer` executes it (shared `FfmpegProcess` discovery/run
       helper, extracted from the legacy renderer). `POST /render` now branches on
       a `timeline` form field (structured `Timeline` DTO + `asset-<sourceId>`
       blobs) → `ITimelineRenderer`; the legacy `audio`+`scenes`+`image-N` path is
       untouched. New **Timeline** nav tab seeds a read-only timeline from the
       active project's storyboard + voiceover (`seedTimelineFromScenes`) and
       exports through the new path. Regression gate proven both ways: golden-string
       tests assert the compiler reproduces the legacy filter graph, and a live
       render of equivalent inputs was **byte-identical** to the legacy path
       (1080×1920 h264 / aac, `-shortest`). Captions stay fused into the photo
       frames this phase (compiler ignores caption tracks); they split into an
       alpha overlay in TL Phase 3.
     - ✅ **TL video-clip ingestion (minimal slice)** — pulled forward from the
       "later/separate scope" item. `Timeline.Assets` (`MediaAsset` list) tells the
       compiler a still (`image`, looped) from real video (`video`, trimmed): video
       clips emit `-ss <inPoint> -t <duration> -i` and merge into the base-layer
       `concat` in start-time order; when any video is present the voiceover is
       `apad`-padded so `-shortest` stops at the visual length (an appended clip
       isn't cut). Web: **🎬 Add video** on the Timeline tab (probe duration/dims +
       poster frame via `features/timeline/media.ts`, blob in IndexedDB **v5**
       `timelineAssets` store `timelineAssetRepo.ts`, appended via pure
       `timelineOps.appendVideoClip`; `mergeVideoTracks` re-attaches added videos
       when the storyboard re-seeds). The clip's own audio is muted in v1
       (voiceover stays the only audio track). Verified: photo+video render →
       6s@30 (180 frames), photo span still / video span motion (frame-diffed);
       photo-only path byte-identical. Deferred at the time: frame-accurate
       `<video>` scrub preview, per-clip trim UI, video audio mixing — the latter
       two have since shipped (TL Phase 2's trim handles; video audio mixing
       below). Frame-accurate scrub preview remains deferred.
     - ✅ **TL Phase 2 — Interactive editing** (shipped 2026-07-18): the Timeline
       tab is now an editor (`TimelineEditor.tsx`), not a read-only view. Per-clip
       **select**, **drag-to-reorder** (HTML5 DnD, within a lane), **trim** both
       edges (pointer handles — stills change `duration`; video also moves
       `inPoint`/`outPoint`, clamped to the asset length), **split at playhead**
       (`S`), **delete** (`Del`, guarded from removing the last visual clip), a
       click-to-scrub **playhead**, and **Play/Pause** playback (a rAF clock
       drives the playhead + synced voiceover; the live frame+caption **preview**
       swaps stills as it plays, video shows its poster). Pure ops
       (`reanchor`/`moveClip`/`trimClip`/`splitClip`/`deleteClip` in
       `timelineOps.ts`) keep the base `concat` contiguous and re-derive the
       display-only caption lane by source id. **The saved timeline is now the
       source of truth** (loaded as-is; storyboard only seeds it once); a **🔄
       Re-sync** action rebuilds photo/caption/audio from the current storyboard,
       keeping added videos. No backend change — the compiler already ordered by
       `startTime` and honored `duration`/`inPoint`/`outPoint`; new xUnit test
       locks that a split (two clips, one source) emits an input per clip.
       Captions still fused (overlay split is Phase 3). Verified: backend 12/12,
       `tsc -b && vite build` clean, 20/20 pure-ops assertions.
     - ✅ **TL Phase 4 — Multi-track audio** (shipped 2026-07-18, ahead of Phase 3
       per the "light editing" priority): background **music/SFX** with per-track
       **volume**/**mute** and per-clip **fade in/out**. `FilterGraphCompiler`
       grew a mix path — each unmuted audio clip is an input-seek-trimmed input
       with `volume` (clip × track gain), `afade` in/out, and `adelay` placement,
       then `amix=inputs=N:normalize=0` + `apad` so `-shortest` keeps the **visual
       length as master**. The single plain-voiceover case stays on the legacy
       direct-map path (byte-for-similar; muting the only extra track falls back
       to it). Web: **🎵 Add music** on the Timeline tab (blob in `timelineAssets`,
       clip clamped to timeline length at 0.3 gain); music clips are selectable
       with an inspector (track volume/mute, fade in/out, remove). Pure ops
       `addMusic`/`setTrackAudio`/`setClipFade`/`removeTrack` + `trimClip` extended
       to audio; `mergeVideoTracks` → `mergeAddedMedia` so music survives re-sync.
       Verified: backend 15/15, build/lint clean, 16/16 audio-ops assertions, and
       the exact `volume,afade,adelay,amix,apad` graph rendered by ffmpeg
       end-to-end (h264+aac, 9.0s master length).
     - ✅ **TL Phase 3 — Layering + transform** (sliced 3a→3b→3c, all shipped):
       - ✅ **3a — Caption alpha-overlay split** (2026-07-18): captions are no
         longer fused into the photo frames. Each caption clip rasterizes to a
         **transparent full-frame PNG** (`captions/drawCaption.ts`
         `renderCaptionOverlay`, sharing the brand `drawCaption` extracted from
         `storyboard/composite.ts`), ships as a `caption-<clipId>` multipart part,
         and the compiler composites it as a **top `overlay=0:0:enable='between(t,
         start,end)'`** layer. Caption inputs are appended **after** the audio
         inputs so audio stream indices — and every golden test — are untouched;
         with no caption PNGs the graph still maps `[vout]` unchanged. Photo frames
         now export caption-free (`compositeFrame(…, false)`). Verified end-to-end
         via a real `/render` POST: h264/aac 1080×1920 4s, caption box present at
         t=1 and absent at t=3 (frame-sampled). Backend 18/18, `tsc -b && vite
         build` clean. **This unblocks transforms** — the image can now move
         independently of the text.
       - ✅ **3b — Per-clip transform.** Reframe (zoom/pan, via `Clip.Crop`) shipped
         first — a normalized source crop before the cover-fit, a Zoom + Pan X/Y
         inspector, an approximate CSS preview. *(Landed in the same commit as the
         `@greyvetro/ui` design-system work below, under a message that only
         described the latter.)* **Rotation** (`Clip.Rotation`, degrees, shipped
         2026-07-20) closed out the phase: the compiler auto-computes the smallest
         uniform zoom that keeps a tilted frame gap-free (`k = cosθ + (H/W)·sinθ`)
         before `scale=k·w:k·h,rotate=θ*PI/180:ow=w:oh=h` crops back down — no black
         corners at any angle the ±45° Tilt slider allows. Verified: +6 golden-string
         tests, and a real `/render` POST — every corner of a 15°-tilted frame
         sampled solid background color.
       - ✅ **3c — Layering** (shipped 2026-07-20): any photo/video track above the
         base zIndex composites as a PiP/logo-style `overlay` — scaled to a
         normalized `Clip.Scale` (aspect kept via ffmpeg `-2`), placed at a
         normalized `Clip.Position`, gated to its window, ordered by zIndex, under
         the caption layer (its inputs land right after audio, captions after
         those — no existing stream-index test moved). Web: **🖼 Add overlay** on
         the Timeline tab adds an image as its own track (default: spans the whole
         timeline, a persistent watermark); selecting it opens a Position X/Y +
         Size inspector and the preview composites it live. Overlay clips edit like
         music (one clip, end-trim only, removed as a whole track) since they don't
         join the base `concat` — `timelineOps.ts` now distinguishes the base
         visual track from overlay tracks by zIndex throughout (`reanchor`/
         `moveClip`/`splitClip`/`deleteClip`/`visualEnd`/the "keep one clip" guard
         are all base-only), and `mergeAddedMedia` carries overlay tracks across a
         re-sync like video/music. Verified: backend 26/26 total, `tsc -b && vite
         build` + lint clean, and a real `/render` POST — a PiP pixel sampled
         background color outside its window and overlay color inside it.
     - ✅ **TL Phase 5 — Motion** (shipped 2026-07-20): Ken Burns pan/zoom on
       stills via keyframed `Clip.Motion.From/To` (`{ zoom, panX, panY }`),
       animated linearly across the clip's full duration by ffmpeg `zoompan`.
       The recipe was verified empirically against ffmpeg 8.1 before wiring it
       in — the pattern every other still uses (`-loop 1 -t <duration> -i`)
       makes zoompan re-run its whole `d`-frame cycle **once per demuxed input
       frame** (100 input frames × d=120 → 12,000 output frames); the fix is an
       **unbounded** `-loop 1 -i` (no input-side `-t`) plus a trailing
       `trim=end_frame=<d>,setpts=PTS-STARTPTS` **inside the filter graph** so
       the clip's stream self-terminates (it feeds a shared `concat` alongside
       other clips, not a standalone output — no external `-t`/`-frames:v` to
       lean on; without the in-graph trim the render hangs forever). Source is
       pre-cover-fit to 3× the output size (`KenBurnsHeadroom`, matches the
       reframe control's `MAX_ZOOM`) so the crop window stays native-res even
       at max zoom; `x`/`y` reference zoompan's own `zoom` variable, clamped
       in-bounds. Stills only (video-source clips ignore Motion, keep their
       `-ss`/`-t` trim); mutually exclusive with static `Crop`/`Rotation` on
       the same clip (identical From/To is a no-op, falls back to the static
       chain). Web: transform inspector's **🎥 Add motion** toggle swaps the
       static Zoom/Pan/Tilt controls for paired Start/End keyframe editors;
       live preview lerps zoom/pan by playhead position within the clip so
       scrubbing shows the animation. Verified: backend 31/31 (5 new tests),
       `tsc -b && vite build` + lint clean, and a real `/render` POST — a
       4s/120-frame clip visibly zoomed + panned between first and last frame.
     - ✅ **TL Phase 6 — Transitions + polish** (shipped 2026-07-20): video
       crossfades (`Clip.TransitionIn`, dissolve/fade-to-black, ffmpeg `xfade`
       — cut-joined clips group into segments folded pairwise, so zero
       transitions stays byte-identical to the pre-Phase-6 graph; duration
       clamped to 90% of the shorter adjacent clip both client- and
       server-side, since the overlap shrinks the base track's effective
       length and the editor's re-anchored timeline must match what renders).
       Web: a ⤭ badge on each inter-clip boundary opens a style+duration
       inspector; clip bars visually overlap once a transition is set (no
       extra rendering — `left`/`width` are still plain percentages). Timeline
       **zoom** (pixels-per-second, 20–400, with Fit) replaced the old
       percentage-of-container layout, ruler+lanes scrolling independently of
       a pinned label column; trims **snap** to nearby clip edges/the playhead
       within an 8px threshold. **Undo/redo** (`useTimelineHistory.ts`, a
       ref-based past/future stack — not `useState`, to dodge Strict Mode's
       double-invoked updaters double-pushing history) backs every edit path
       (editor edits, video/music/overlay adds, re-sync); Cmd/Ctrl+Z (+Shift
       for redo) plus toolbar buttons. Scope cuts: no audio `acrossfade`, no
       fade-from/to-black on the first/last clip, continuous slider drags
       aren't coalesced into one undo step. Verified: backend 36/36 (5 new
       transition tests), `tsc -b && vite build` + lint clean, a real
       `/render` POST frame-sampled a genuine 50/50 blend mid-crossfade
       (pure red → blend → pure blue, total duration correctly 3+3−1=5s),
       and zoom/snap/badge/undo-redo driven live in Chrome. Full writeup:
       [docs/timeline-editor-plan.md](docs/timeline-editor-plan.md) §11.
     - ✅ **Video-clip own-audio mixing** (shipped 2026-07-20, after Phase 6):
       closes one of the two items still deferred from the original video-
       ingestion slice. A base-track video clip can opt in (`Clip.IncludeAudio`)
       to mix its own embedded audio into the export — previously always muted.
       The compiler reuses that clip's *own* visual input's `[i:a]` (already
       `-ss`/`-t` trimmed to its window) as an extra `amix` member instead of
       adding a new `-i`, so no downstream input indices shift; reuses the
       clip's existing `Volume`/`FadeIn`/`FadeOut` fields for its own gain/fades
       (no new numeric fields). Web: selected video clip's reframe inspector
       gained an "Include this clip's audio" checkbox + Vol/Fade controls.
       Verified: backend 38/38 (2 new tests), build/lint clean, and a real
       `/render` POST — silent voiceover + a video clip with an embedded 440Hz
       tone: exported audio at the noise floor (-39.7dB) during the photo-only
       window, a clear tone (-23.8dB) exactly during the video's window.
     - Remaining: frame-accurate `<video>` scrub preview (still deferred);
       transitions/undo-redo scope cuts above, if ever needed.
   - Phase 0 (repo rename) is deliberately deferred pending name confirmation
     (`greyvetro-studio` proposed). Later/optional: Gemini image generation
     (the key already has `gemini-3-pro-image` / nano-banana access), clip
     transitions, Flutter parity.

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
