# Greyvetro Studio — Multimedia Creation Tool Plan

> Status: **in progress** — Phase 1 (STT) built 2026-07-17 · Drafted 2026-07-17
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
| 1–2 | Master prompt → topic → script (LLM) | ~~Anthropic API~~ **Changed 2026-07-17: Google Gemini API** (user decision — free tier; the Anthropic API has no free tier). `POST /script` calls `generateContent` on `gemini-flash-latest` (rolling alias — pinned versions get retired for new keys; override via `GEMINI_MODEL`) through a named `HttpClient` — no SDK. Key in env var `GEMINI_APIKEY` (free at https://aistudio.google.com/apikey), optional: without it `/script` returns 503 with instructions. Same Command/Handler pattern as existing features. | Small |
| 3 | Voiceover (ElevenLabs) | Already built: composer, voice picker, voice settings, model choice, takes. | ✅ Done |
| 4 | Timestamped transcript | New backend `POST /stt` → ElevenLabs Scribe. Accepts the generated take's audio (or an uploaded file), returns text + word timestamps. Lives in `ElevenLabsService` next to the existing calls. | Small |
| 5 | Timestamped script → scene prompts (LLM) | Built as a sibling endpoint `POST /script/scenes` (clearer REST than a mode flag): transcript + word timestamps in → scenes JSON out (start/end seconds, narration excerpt, image prompt). Uses Gemini **structured output** (`responseSchema` + `responseMimeType: application/json`) so parsing is reliable. | Small |
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
| **1. STT** ✅ | `POST /stt` (ElevenLabs Scribe, word timestamps) + "Transcribe" action on a saved take in the web UI. Built 2026-07-17: `TranscribeAudioCommand`/`Handler`, `Transcript` entity, Scribe called via a typed `HttpClient` (the ElevenLabs-DotNet SDK has no STT endpoint); web gallery cards get a "📝 Transcribe" chip → transcript stored on the `GalleryItem` in IndexedDB → `TranscriptModal` (full text / word-timings views, copy). **Requires the ElevenLabs API key to have the `speech_to_text` permission** — enable it on the key in the ElevenLabs dashboard (verified 401 `missing_permissions` otherwise). | S |
| **2. Script generation** ✅ | Built 2026-07-17 on **Gemini** (see §3 rows 1–2, 5): `POST /script` (topic → TTS-ready script) + `POST /script/scenes` (transcript → scenes JSON via structured output), `GeminiService` in Infrastructure, `GenerateScriptHandler`/`GenerateScenesHandler`. Web UI: composer "✨ Write with AI" chip → `ScriptAssistModal` (topic, style, ~30/60/90/120s) fills the script editor; TranscriptModal "🎬 Scene prompts" view lists scenes with per-scene copy-prompt buttons (paste into Flow). Requires `GEMINI_APIKEY`. | S |
| **3. Storyboard** | `features/storyboard/` in the web app: scenes from timestamps, image upload per scene, reorder, synced audio+image preview. IndexedDB `scenes` store. | M |
| **4. Render** | `POST /render` ffmpeg pipeline (images + durations + audio, optional Ken Burns zoom + caption burn-in) → mp4 download. | M |
| **5. Later (optional)** | Nano Banana / Gemini image generation via API · voice preview & favorites · clip trimming · transitions · Flutter parity. | — |

Phases 1 and 2 are independent; 3 depends on 1 (timestamps), 4 depends on 3.

## 6. Constraints & notes

- **ElevenLabs Scribe** is available on the current account tier (STT is not
  gated like voice cloning) — verify credit cost per minute when wiring it up.
  **Note (found during Phase 1):** the API key is scoped, so it needs the
  `speech_to_text` permission enabled in the ElevenLabs dashboard — done
  2026-07-17; `/stt` verified end-to-end with word timestamps.
- ~~**Anthropic API key** required for phases 2+~~ **Superseded 2026-07-17:**
  Phase 2 uses the **Google Gemini API free tier** instead (user decision — no
  Anthropic free tier exists). Env var `GEMINI_APIKEY`; never in any committed
  file. Free-tier rate limits (a handful of requests/min on the flash models)
  are ample for this workflow. The same key can also use Gemini image models
  (`gemini-3-pro-image`, `nano-banana-pro-preview`) — the Phase 5 automation
  path.
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
