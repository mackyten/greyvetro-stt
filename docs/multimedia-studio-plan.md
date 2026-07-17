# Greyvetro Studio — Multimedia Creation Tool Plan

> Status: **planned** (not started) · Drafted 2026-07-17
>
> Converts the current TTS app into an AI-assisted **video assembler**: script
> generation → voiceover → timestamped transcript → scene images → rendered mp4.
> Derived from the handwritten "Video Generation" workflow notes (Claude master
> prompt → script → ElevenLabs voiceover → transcribe → scene prompts → images
> via Flow/Nano Banana → assemble).

---

## 1. Vision & scope decision

The target is **not** a general-purpose video editor (multi-track timeline,
frame-accurate trims, transitions — a CapCut clone). It is a **scene-based
video assembler** driven entirely by the voiceover timeline:

- The **voiceover audio is the master clock**. Everything else (scenes, images,
  captions) hangs off its word-level timestamps.
- A "video" = one **Project** (the existing web-frontend Projects feature) =
  ordered audio clips + a storyboard of scenes.
- A "scene" = an image (or later, a short clip) + a start/end time derived from
  the transcript.
- Export = server-side **ffmpeg** render (images concat'd with durations +
  audio track + optional burned-in captions).

**Explicitly deferred:** imported-video trimming/splitting, multi-track
timelines, transitions, in-browser decode (WebCodecs / ffmpeg.wasm). The
workflow in the notes never needs them; revisit only if scene assembly proves
insufficient.

## 2. Terminology correction

The repo name says "stt" but the app is **TTS** (text→speech). The new
workflow needs both directions:

| Direction | Workflow step | Status |
|---|---|---|
| TTS (text → voiceover) | Notes step 3 — "voiceover first, scene second" | ✅ Built (`POST /tts`, ElevenLabs) |
| STT (voiceover → timestamped text) | Notes step 4 — "turn audio into accurate text" | ❌ To build — **ElevenLabs Scribe** (`scribe_v1`), word-level timestamps, **same API key** already configured. Replaces FOJISCRIBE entirely. |

## 3. Workflow mapping (notes → features)

| # | Notes step | Implementation | Effort |
|---|---|---|---|
| 1–2 | Master prompt → topic → script (Claude) | New backend `POST /script` calling the **Anthropic API** via the official C# SDK (`dotnet add package Anthropic`), model `claude-opus-4-8`. Same Command/Handler pattern as existing features. Adds `Anthropic:ApiKey` to backend config (env var `Anthropic__ApiKey`, never committed — same rule as the ElevenLabs key). | Small |
| 3 | Voiceover (ElevenLabs) | Already built: composer, voice picker, voice settings, model choice, takes. | ✅ Done |
| 4 | Timestamped transcript | New backend `POST /stt` → ElevenLabs Scribe. Accepts the generated take's audio (or an uploaded file), returns text + word timestamps. Lives in `ElevenLabsService` next to the existing calls. | Small |
| 5 | Timestamped script → scene prompts (Claude) | Same `/script` endpoint, different prompt mode: transcript in → JSON out (scene breaks: start/end time, narration excerpt, image prompt). Use **structured outputs** (`output_config.format` with a JSON schema) so parsing is reliable. | Small |
| 6 | Generate images (Flow / Nano Banana 2) | **Manual for v1**: user generates images in Flow (per the notes: agent mode off, image mode, 1× output per prompt, paste each scene prompt) and **imports** them into scene slots. Optional later: Gemini API image generation (Nano Banana) — separate Google billing + integration, so deferred. | v1: none / later: Medium |
| — | Assemble → mp4 | Storyboard UI + backend ffmpeg render (see §5). | Medium |

End-to-end result: type a topic → Claude writes the script → generate the
voiceover → auto-transcribe with timestamps → Claude proposes scenes + image
prompts → drop images onto scenes → preview → export mp4. Only image
generation stays manual in v1.

## 4. Architecture fit

Everything follows the existing conventions — no structural changes.

### Backend (`backend/`, .NET 10 Clean Architecture)
- New features as `record` Command/Query + `Handler`, registered in
  `ServiceCollectionExtensions.cs`; endpoints stay thin in `Program.cs`:
  - `POST /stt` — `TranscribeAudioCommand` → ElevenLabs Scribe (multipart audio in, transcript + word timestamps out)
  - `POST /script` — `GenerateScriptCommand` → Anthropic API (two modes: topic→script, transcript→scenes JSON)
  - `POST /render` — `RenderVideoCommand` → ffmpeg (scene list + audio in, mp4 out); ffmpeg invoked as an external process from Infrastructure
- **Both API keys live only on the backend.** Frontends never see them (existing rule, unchanged).
- ffmpeg is a runtime dependency of the backend (document install: `brew install ffmpeg` on macOS).

### Web frontend (`frontend-web/`, React 19 — primary surface for this)
- The **Projects** feature is the natural foundation: a project becomes "one
  video"; its saved clips are the voiceover; scenes attach to the project.
- New `features/storyboard/`: vertical scene list (thumbnail, time range,
  narration excerpt, image prompt with copy button for Flow), drag-to-reorder,
  per-scene image upload/swap.
- **Preview** is browser-side and cheap: play the existing `AudioPlayer` and
  swap a displayed `<img>` at scene boundaries — no video decode needed.
- Scene metadata + images persist in **IndexedDB** (`core/db.ts` — add a
  `scenes` store, **bump the DB version** per the existing convention).
- Export button → `POST /render` → download mp4.

### Flutter desktop (`frontend/`)
- Out of scope for the studio features (stays a TTS client). Revisit parity later if wanted.

## 5. Build phases

| Phase | Deliverable | Size |
|---|---|---|
| **0. Rename** | Repo/folder `greyvetro-stt` → `greyvetro-studio`; update both CLAUDE.md files + README. .NET namespaces (`Greyvetro.*`) are already generic — no code churn. Avoid "STT" in the name; the app is TTS-first ("studio" reads better). | XS |
| **1. STT** | `POST /stt` (ElevenLabs Scribe, word timestamps) + "Transcribe" action on a saved take in the web UI. | S |
| **2. Script generation** | `POST /script` (Anthropic C# SDK, `claude-opus-4-8`, structured outputs for scene mode) + composer "Write script with AI" entry point and scene-prompt generation from a transcript. | S |
| **3. Storyboard** | `features/storyboard/` in the web app: scenes from timestamps, image upload per scene, reorder, synced audio+image preview. IndexedDB `scenes` store. | M |
| **4. Render** | `POST /render` ffmpeg pipeline (images + durations + audio, optional Ken Burns zoom + caption burn-in) → mp4 download. | M |
| **5. Later (optional)** | Nano Banana / Gemini image generation via API · voice preview & favorites · clip trimming · transitions · Flutter parity. | — |

Phases 1 and 2 are independent; 3 depends on 1 (timestamps), 4 depends on 3.

## 6. Constraints & notes

- **ElevenLabs Scribe** is available on the current account tier (STT is not
  gated like voice cloning) — verify credit cost per minute when wiring it up.
- **Anthropic API key** required for phases 2+. Config pattern mirrors
  `ElevenLabs__ApiKey`. Never in any committed file.
- **Flow has no public API** — it's a UI. That's why v1 keeps image generation
  manual (copy prompt → generate in Flow → import). Nano Banana (Gemini image
  models) is the API path if/when automating.
- CORS is still wide open and port 5050 is still the source of truth
  (`appsettings.json`) — unchanged by this plan.
- Update the CLAUDE.md Roadmap as phases ship (existing workflow rule).

## 7. Open questions

- New repo name: `greyvetro-studio` proposed — confirm before Phase 0.
- Render output spec: resolution (1080×1920 vertical for shorts vs 1920×1080?),
  caption styling, Ken Burns on/off default.
- Whether scenes should support short video clips (not just stills) in v1 —
  ffmpeg handles it easily; the storyboard UI cost is small; browser preview
  cost is moderate.
