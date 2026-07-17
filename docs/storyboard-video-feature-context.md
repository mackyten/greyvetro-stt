# Feature Context — Storyboard & Video Export ("Video Editing")

> **Audience:** Business Analyst.
> **Purpose:** Give a complete, non-code picture of the video-editing feature —
> what it does today, how it works, its constraints, and where the improvement
> opportunities are — so scope for the next iteration can be defined.
> **Status:** Built and verified end-to-end (Greyvetro Studio Phases 3–4). Web
> frontend only.
> **Last updated:** 2026-07-17.

---

## 1. What the feature is

Greyvetro started as a text-to-speech app and is evolving into **Greyvetro
Studio**, an AI-assisted short-form **video assembler**. The "video editing"
capability is the back half of that pipeline: it turns a generated **voiceover**
into a finished vertical **MP4** by letting the user lay out timed visual
**scenes** on top of the audio and export the result.

In one sentence: **a voiceover clip becomes a captioned, vertical social-video
MP4 by attaching one image per timed scene and rendering.**

The output is optimised for **short-form vertical video** (TikTok / Reels /
Shorts / YouTube Vertical): **1080 × 1920, 30 fps, H.264 video + AAC audio.**

---

## 2. Where it fits — the full Studio pipeline

The video feature is the final two stages of a five-stage flow. Each stage is
already built:

```
1. SCRIPT      Topic ──▶ AI writes a TTS-ready script          (Google Gemini)
2. VOICEOVER   Script ─▶ Spoken audio clip                      (ElevenLabs TTS)
3. TRANSCRIBE  Audio ──▶ Word-level timestamped transcript      (ElevenLabs Scribe / STT)
4. STORYBOARD  Transcript ─▶ Timed scenes w/ image prompts      (Google Gemini)   ◀── this feature
5. RENDER      Scenes + images + audio ─▶ MP4                    (ffmpeg)          ◀── this feature
```

The voiceover audio is the **master clock**. Everything downstream — scene
boundaries, caption timing, video length — is anchored to the audio timeline, so
picture and sound always stay in sync.

---

## 3. End-to-end user workflow (as built today)

A **Project** groups related clips; **one project = one video.** The user works
in a dedicated **Storyboard** tab.

1. **Pick the voiceover.** The user selects one saved voiceover clip from the
   active project.
2. **Generate the storyboard (one click).** The system:
   - transcribes the clip to word-level timestamps (if not already done), then
   - asks the AI to split the narration into **contiguous, timed scenes**
     (roughly one scene every 4–8 seconds).
   - Each scene comes back with a **start/end time**, the **exact narration
     excerpt** spoken during it, and a rich **image prompt** describing the
     visual (subject, composition, lighting, mood) in a consistent style.
3. **Source the images (manual step).** For each scene the app gives a
   copy-to-clipboard **image prompt**. The user pastes that prompt into an
   external AI image generator, then **uploads the resulting image** back into
   the scene slot. *(There is no automated image generation yet — see §7.)*
4. **Edit the storyboard.** The user can:
   - **Upload / replace / remove** the image on any scene.
   - **Drag to reorder** scenes (timings automatically re-anchor to stay
     contiguous).
   - **Delete a scene** (the gap it leaves is absorbed by its neighbour so the
     timeline stays gapless).
   - **Regenerate** the whole storyboard from scratch.
   - **Preview** the storyboard playing against the voiceover in the browser.
5. **Export MP4.** The app burns the narration in as an on-screen **caption**,
   composites each scene to a full 1080×1920 frame, sends everything to the
   backend, and ffmpeg assembles and returns the finished **MP4 download**.
   - Scenes with **no image** render as a branded **dark placeholder card** (the
     user is warned before exporting with missing images).

---

## 4. Current capabilities (what works today)

| Area | Capability |
|---|---|
| **Scene generation** | AI auto-splits the narration into timed scenes with narration text + image prompt, in a self-consistent visual style. |
| **Timeline** | Scenes are always contiguous and anchored to the voiceover; times auto-recompute on reorder/delete. |
| **Per-scene image** | Upload, replace, or remove an image (PNG/JPG/WebP/GIF). |
| **Reorder** | Drag-and-drop; timings re-anchor automatically. |
| **Delete** | Removes a scene and closes the timeline gap. |
| **Regenerate** | Re-runs AI scene generation for the whole clip. |
| **Prompt handoff** | One-click copy of each scene's image prompt for use in an external image tool. |
| **Preview** | In-browser playback of the storyboard synced to the voiceover. |
| **Captions** | Narration is burned into each frame as a styled caption (brand font). |
| **Placeholders** | Imageless scenes render as a dark branded card rather than blocking export. |
| **Export** | One-click render to a downloadable vertical MP4 (H.264/AAC, 1080×1920, 30 fps). |

---

## 5. How it works (architecture, at a glance)

- **Where the work happens:**
  - *Scene generation & transcription* → backend calls **Google Gemini** and
    **ElevenLabs**.
  - *Storyboard editing & caption compositing* → **in the browser** (React web
    app).
  - *Final video assembly* → backend runs **ffmpeg** as a local process, then
    streams the MP4 back.
- **Why captions are drawn in the browser (not by ffmpeg):** the backend's
  ffmpeg build has no text-rendering support, so the app paints each caption
  onto the frame in the browser using the brand font before sending it to
  render. *This is a technical constraint worth knowing — it shapes what caption
  styling is easy vs. hard to change.*
- **Storage is browser-local.** Scenes, images, projects, and clips live in the
  user's **browser (IndexedDB)** — nothing about a storyboard is saved on a
  server. This has direct product implications (see §6 and §7).
- **The render is stateless.** The backend builds each video in a temporary
  folder and deletes it afterward; it keeps no copy of the video or the inputs.

---

## 6. Dependencies & runtime requirements

| Dependency | Used for | If unavailable |
|---|---|---|
| **ElevenLabs API** (TTS + Scribe STT) | Voiceover + transcription | Transcription/voiceover unavailable; API key needs `speech_to_text` permission. |
| **Google Gemini API** (free tier) | Script + scene generation | Scene generation returns a clear "not configured" message. |
| **ffmpeg** (installed on the backend machine) | Final MP4 assembly | Export returns a clear "install ffmpeg" message. |
| **Modern browser** (Canvas, IndexedDB) | Editing, caption compositing, local storage | Feature can't run. |

**Cost note:** ElevenLabs runs on a metered free tier (~10k credits/month);
Gemini is on a free tier. Heavy use will hit those limits. Voice **cloning**
requires a paid ElevenLabs plan (adjacent feature, not required for video).

**Deployment note:** the app is currently **local-development only** (single
user, CORS open, no hosting/auth). Multi-user or hosted use is not yet in scope
and would be its own project.

---

## 7. Known limitations & constraints

These are the seeds for improvement work. Grouped by theme.

### Automation gaps
- **No automated image generation.** The single biggest manual step: the user
  must copy each prompt into an external image tool and re-upload the result.
  *(Note: the current Gemini API key already has access to image-generation
  models — so this is a natural, high-value next step.)*
- **No image regeneration / variations per scene** — every image is sourced by
  hand.

### Output & creative limitations
- **Fixed format:** vertical 1080×1920 only. No landscape (16:9) or square (1:1)
  option for YouTube/LinkedIn/etc.
- **Static images only:** no motion — no Ken Burns zoom/pan, no parallax.
- **Hard cuts only:** no transitions (fades, dissolves, wipes) between scenes.
- **No background music or sound effects** — voiceover is the only audio track.
- **No titles, logos, lower-thirds, or brand overlays** beyond the auto caption.
- **Caption styling is fixed** (position, size, colour, background box) and
  always on. The caption text is the narration **verbatim** — it can't be edited
  independently or turned off per-project in the UI.

### Editing-control limitations
- **No manual duration control:** scene lengths are derived purely from the
  voiceover timing. The user can reorder/delete but can't stretch, shorten, or
  re-time an individual scene, or split/merge scenes.
- **No trimming** of the voiceover or the video.
- **No undo/redo** in the storyboard editor.
- **One voiceover per video:** a project maps to a single clip; no multi-clip or
  multi-segment stitching.

### Persistence, sharing & platform
- **Browser-local only:** storyboards and images live in one browser. Clearing
  browser data loses the work; nothing syncs across devices; nothing is shared
  or backed up.
- **No collaboration / review / approval** workflow.
- **No direct publishing** — export is a local file download; no share links or
  push to social platforms.
- **Web-only:** the desktop (Flutter) app has TTS but **no storyboard or video
  export** — no feature parity.

### Operational / scale
- **Synchronous render, no job/progress model:** the video is built on-request
  with no queue or progress indicator; long or many-scene videos could be slow
  or time out. No concurrency/scaling story yet.
- **Preview ≠ final:** the in-browser preview swaps raw images on the timeline;
  it does not show the exact composited/captioned frame the export produces.

---

## 8. Improvement opportunities (candidate backlog themes)

Framed as outcomes for prioritisation — not a committed roadmap.

1. **Close the image loop (highest leverage).** Auto-generate scene images from
   the AI prompts inside the app (models are already accessible on the current
   key). Removes the biggest manual, tool-switching step and makes "topic → video"
   near one-click. Follow-ups: per-scene "regenerate image" and image variations.
2. **Creative output quality.** Ken Burns motion on stills, scene transitions,
   background-music track, and title/logo/branding overlays — the levers that
   move output from "slideshow" to "produced video."
3. **Format flexibility.** Selectable aspect ratio (vertical / square /
   landscape) to target more platforms from one storyboard.
4. **Finer editing control.** Editable caption text & styling (and an on/off
   toggle), manual scene re-timing, split/merge scenes, undo/redo.
5. **Persistence & collaboration.** Server-side storage of projects/storyboards
   so work survives, syncs across devices, and can be shared/reviewed — the
   prerequisite for any team or hosted use.
6. **Publishing & distribution.** Share links or direct export to social
   channels instead of a local file only.
7. **Scale & UX of render.** Async render jobs with progress/queue and a
   true-to-output preview, so longer videos are reliable and predictable.
8. **Reach.** Desktop (Flutter) parity if the desktop app is a target surface.

---

## 9. Open questions for product/BA discussion

- **Who is the primary user and use case?** (Internal marketing content?
  Client-facing? Volume per week?) This reframes priority — automation &
  publishing matter more at volume; creative control matters more for polish.
- **Which platforms must the output serve?** (Drives the aspect-ratio question.)
- **Is hosted / multi-user a near-term goal?** If yes, server-side persistence &
  auth move up sharply; if no, browser-local is acceptable for longer.
- **What's the acceptable production effort per video?** (Determines how much
  automation vs. manual creative control to invest in.)
- **Any brand/caption/style standards** the output must conform to? (Affects
  caption editing, overlays, and templating.)
- **Is desktop (Flutter) parity required, or is web the product surface?**

---

## 10. Reference — where this lives in the codebase (for engineering follow-up)

| Concern | Location |
|---|---|
| Storyboard editor UI | `frontend-web/src/features/storyboard/StoryboardScreen.tsx` |
| In-browser preview | `frontend-web/src/features/storyboard/StoryboardPreview.tsx` |
| Caption compositing (browser) | `frontend-web/src/features/storyboard/composite.ts` |
| Scene storage (browser IndexedDB) | `frontend-web/src/features/storyboard/sceneRepo.ts` |
| Video assembly (ffmpeg driver) | `backend/Greyvetro.Infrastructure/Ffmpeg/FfmpegVideoRenderer.cs` |
| Render request handler | `backend/Greyvetro.Application/Features/Render/RenderVideoCommand.cs` |
| Scene / script generation (Gemini) | `backend/Greyvetro.Infrastructure/Gemini/GeminiService.cs` |
| API endpoints (`/render`, `/script/scenes`, `/stt`, `/tts`) | `backend/Greyvetro.API/Program.cs` |
| Full original plan | `docs/multimedia-studio-plan.md` |
