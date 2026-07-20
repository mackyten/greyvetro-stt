# Timeline Editor — Architecture Plan (v2, corrected for this codebase)

**Purpose:** Replace the linear *Storyboard → Render* step with a CapCut-style,
multi-track, non-linear timeline editor — layered video/photo/audio, trim, crop,
transform, drag-to-arrange — while **extending the existing backend ffmpeg
pipeline rather than replacing it**.

**Status:** In progress. Supersedes the first draft; corrections below are grounded
in the actual code (`FfmpegVideoRenderer.cs`, `Program.cs` `/render`,
`composite.ts`, `StoryboardScreen.tsx`, `sceneRepo.ts`, `core/db.ts`).

> **Phase 1 shipped (2026-07-17).** Model (`Domain/Entities/Timeline.cs` +
> `features/timeline/model/types.ts`), pure `FilterGraphCompiler`
> (`Infrastructure/Ffmpeg/`, xUnit-tested in `Greyvetro.Tests`),
> `FfmpegTimelineRenderer`, `POST /render` timeline branch, IndexedDB v4
> `timelines` store, and a read-only **Timeline** tab seeded from the storyboard.
> Regression gate met: golden-string tests + a live render byte-identical to the
> legacy path. ffmpeg §9 gate passed — all listed filters present.
>
> **Video-clip ingestion (minimal slice) also shipped (2026-07-17)** — pulled
> forward from §11's "later/separate scope." `Timeline.Assets` carries source types
> so the compiler renders stills (looped) vs. real video (`-ss`/`-t` trim, merged
> into the base `concat`); the voiceover is `apad`-padded (so `-shortest` = visual
> length) whenever video is present. Web **🎬 Add video** appends a clip after the
> scenes; blobs live in IndexedDB **v5** `timelineAssets`. Verified with a mixed
> photo+video render (photo span still, video span motion, frame-diffed). Per-clip
> trim UI landed with Phase 2's general trim handles (stills change `duration`;
> video also moves `inPoint`/`outPoint`); mixing the video's own audio landed after
> Phase 6 (below), and frame-accurate `<video>` scrub preview landed after that
> (below) — closing out every item once deferred from this slice.
>
> **Video-clip own-audio mixing shipped (2026-07-20, after Phase 6).** A base-
> track video clip can opt in (`Clip.IncludeAudio`) to mix its own embedded audio
> alongside the voiceover/music — previously always muted. The compiler reuses
> that clip's *existing* visual input's `[i:a]` stream (already `-ss`/`-t` trimmed
> to the clip's window by the same input) as an extra member of the existing
> multi-track audio mix (`amix`), rather than adding a new `-i` — so it doesn't
> shift any downstream overlay/caption input indices, and the single-plain-
> voiceover legacy path is preserved when no clip opts in. Reuses the clip's own
> `Volume`/`FadeIn`/`FadeOut` fields (already generic on `Clip`) for the embedded
> audio's own gain/fades — no new numeric fields needed, just the one boolean.
> Web: a selected video clip's reframe inspector gained an "Include this clip's
> audio" checkbox, revealing Vol/Fade-in/Fade-out controls when checked. Verified:
> 2 new xUnit cases (38/38 backend total — mixed with a dedicated voiceover, and
> alone when the voiceover track is muted, both checking the exact emitted
> `adelay`/`amix`/`apad` graph), `tsc -b && vite build` + lint clean, and a real
> `/render` POST — a silent voiceover + a video clip with an embedded 440Hz tone:
> the exported audio sat at a silence noise floor (-39.7dB mean) during the
> photo-only window and jumped to a clear tone (-23.8dB mean) exactly during the
> video's window.
>
> **Frame-accurate `<video>` scrub preview shipped (2026-07-20).** The last item
> from the original video-ingestion slice (§4's risk note): video-sourced clips
> in the preview now render as a real `<video>` element (`VideoFrame` in
> `TimelineEditor.tsx`) instead of a static poster, seeked to the clip's actual
> source time (`inPoint + clamp(ph - startTime, 0, duration)`) — frame-accurate
> when paused/scrubbing. During playback the video's own clock is left to run
> and only resynced past a 0.3s drift threshold, rather than reseeking on every
> rAF tick (avoids seek-induced stutter that §4 flagged as the risk with a naive
> per-frame seek). Applies to both the base-track preview clip and PiP/logo
> overlay clips of type `video` (the latter has no UI to create yet, but the
> compositing path is shared, so it's ready if one is added). Frontend-only —
> no backend/compiler change; `TimelineScreen.tsx` now keeps a `videoUrls` map
> (raw blob object URLs) alongside the existing poster-frame `imageUrls`.
> Verified: `tsc -b && vite build` + lint clean, backend suite untouched (still
> 38/38, no C# changed). Live in-browser scrub verification was attempted but
> blocked by an unrelated environment limit — this sandboxed Chrome instance
> never progresses a `<video>` past `readyState 0` for *any* source (confirmed
> even for a plain direct navigation to an `ffprobe`-verified-good mp4), which
> also stalls the pre-existing `capturePoster` poster-frame capture the same
> way — not a regression from this change, just not independently confirmable
> pixel-by-pixel in this particular session. Nothing from the original
> video-ingestion slice is deferred anymore; Phases 2–6 above are the
> remaining Timeline work.

---

## 0. What changed from the first draft (and why)

The original plan was directionally right but rested on three wrong assumptions
about this system. The fixes below are load-bearing — the rest of the plan is
built on them.

| # | First draft said | Reality | Ruling in this plan |
|---|---|---|---|
| 1 | Backend modules are `.ts` (Node) | Backend is **.NET 10 / C#**, Clean Architecture (`Domain ← Application ← Infrastructure ← API`) | The ffmpeg compiler + runner are **C#**, in `Greyvetro.Infrastructure`; timeline types in `Domain`; a `Command + Handler` in `Application`. |
| 2 | `filterComplexCompiler.ts` lives on the **frontend**, emits ffmpeg args | Today the client sends *structured DTOs* and the **backend** builds every ffmpeg arg (`Program.cs:179`). Client-emitted ffmpeg strings = command-injection surface + logic duplicated across two languages | The compiler is **backend-side, pure C#, xUnit-tested**. The client only ever sends a structured `Timeline` DTO. |
| 3 | "Captions — no change, still baked in-browser" | Baked captions and ffmpeg-side crop/scale/layering are **mutually exclusive** — you can't crop a clip whose caption is already fused into its pixels | Captions become a **separate transparent (alpha PNG) overlay track**, rendered in-browser with the brand font, composited by ffmpeg `overlay`. Same canvas mechanism, new layer. |

Smaller corrections folded in:
- **`MediaAsset.url` can't be persisted** — blob URLs are ephemeral. Assets store
  their **blob in IndexedDB keyed by id**; `url` is a runtime-only rehydrated field.
- **The "Video track" is greenfield.** Today the system has *zero* video source
  clips — only stills + one voiceover. v1 is **stills + audio + captions**
  (faithfully reproduces today); real video-clip ingestion is a later phase.
- **ffmpeg build is not guaranteed** — Homebrew's build ships **without
  drawtext/freetype**. Any filter this plan leans on (`zoompan`, `xfade`,
  `acrossfade`) must be verified present before a phase depends on it (§9).

---

## 1. Where this fits in the pipeline

```
Script → Voiceover → Transcribe → Storyboard → [Timeline Editor] → Render → Export
```

**Storyboard becomes the seeder, not the editor.** Generating a storyboard now
produces a **Timeline** (a photo track from the scene images, an audio track from
the voiceover, a caption track from the per-scene narration) instead of the
current flat scene list. The user then edits that timeline freely before Render.

The voiceover stays the *conceptual* master clock (captions are anchored to it),
but the **Timeline is the source of truth for duration**. The voiceover is just
the most important clip on one audio track.

---

## 2. Guiding architectural decisions

1. **Non-destructive.** Trim / crop / transform / position are **metadata**, never
   baked into source media until export.
2. **Server-authoritative export.** The frontend sends a structured `Timeline`
   DTO + media blobs + pre-rendered caption overlays. A **pure C# compiler** turns
   that into one ffmpeg filter graph. The client never emits ffmpeg syntax.
3. **One caption-drawing function, two consumers.** The existing `composite.ts`
   canvas caption logic is factored into a pure `drawCaption(ctx, …)` used by
   **both** the live preview (draws onto the preview canvas) **and** the export
   step (rasterizes a transparent overlay PNG). Preview and export captions can't
   drift because they share the draw code.
4. **Stills-first.** v1 targets the content the product actually makes today
   (AI stills + voiceover + captions + music). True multi-video-layer editing is
   the ambitious end state, gated behind its own phase so preview stays tractable.
5. **Compile strategy: base track = concat, extra layers = overlay.** A single
   full-frame sequential visual track is assembled with `concat` (fast path, this
   is exactly today's `FfmpegVideoRenderer`). Additional simultaneous visual
   layers and captions are composited with `overlay … enable='between(t,a,b)'`.
   Don't force everything through `overlay` — it's slower and the graphs get ugly.

---

## 3. Core data model

Persisted as JSON (frontend) and mirrored as C# records (backend DTO). The key
non-destructive split is `inPoint`/`outPoint` (trim within the source) vs.
`startTime`/`duration` (placement on the timeline).

```typescript
interface Timeline {
  id: string;
  outputWidth: number;       // export target, e.g. 1080  (transforms are normalized, so this can change)
  outputHeight: number;      // e.g. 1920
  fps: number;               // e.g. 30
  duration: number;          // derived: max(clip.startTime + clip.duration)
  tracks: Track[];
  // playhead is UI-only state, NOT part of the persisted document
}

interface Track {
  id: string;
  type: "video" | "photo" | "audio" | "caption";
  zIndex: number;            // stacking order for visual tracks (lowest = base)
  muted?: boolean;
  volume?: number;           // 0–1, audio tracks
  clips: Clip[];
}

interface Clip {
  id: string;
  sourceId: string;          // -> MediaAsset.id (clips reference assets; assets aren't duplicated)
  trackId: string;

  // Timeline placement
  startTime: number;         // seconds on the timeline
  duration: number;          // seconds shown on the timeline

  // Trim — non-destructive, relative to the source media
  inPoint: number;           // trim start within source (video/audio only; 0 for stills)
  outPoint: number;          // trim end within source

  // Transform — non-destructive, NORMALIZED 0–1 (survives output-resolution changes)
  crop?: { x: number; y: number; width: number; height: number };
  position?: { x: number; y: number };   // top-left in normalized output space
  scale?: number;
  rotation?: number;

  // Ken Burns / motion (photos) — keyframed transform endpoints (Phase 5)
  motion?: { from: KenBurns; to: KenBurns };

  // Audio
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;

  // Captions — a caption clip carries text; it is rasterized to an overlay at export
  text?: string;

  // Transitions (Phase 6)
  transitionIn?: { type: "cut" | "fade" | "dissolve"; duration: number };
  transitionOut?: { type: "cut" | "fade" | "dissolve"; duration: number };
}

interface MediaAsset {
  id: string;
  type: "video" | "image" | "audio";
  // Blob is persisted in IndexedDB keyed by id (like sceneRepo.ts stores image blobs).
  // `url` is a runtime-only object URL, rehydrated on load — NEVER persisted.
  url?: string;
  duration?: number;         // video/audio only
  width?: number;
  height?: number;
}
```

Design notes:
- **Assets vs. clips** — reused b-roll/logo appears as multiple clips over one
  asset; blob stored once.
- **Normalized transforms** — crop/position/scale are 0–1, so switching output to
  1:1 or 16:9 later doesn't require re-authoring. Only rasterized layers (caption
  PNGs) are re-rendered per target — cheap.
- **Caption clips carry `text`, not pixels.** Pixels are produced at export time
  for the chosen output resolution.

---

## 4. Preview compositor (frontend, canvas 2D)

Makes editing feel live instead of "edit blind, then wait for a render."

- `renderFrame(timeline, t)` composites the frame at playhead `t`: collect clips
  active at `t` across visual tracks, sort by `zIndex`, and for each draw its
  source (video frame via a hidden seeked `<video>`, or image, or **caption text
  via the shared `drawCaption`**) applying crop/scale/position/rotation.
- Playback = a `requestAnimationFrame` loop advancing `t` and re-compositing;
  audio tracks drive synced `<audio>`/`<video>` elements.
- Scrub / trim-drag just re-runs `renderFrame` for one `t` — cheap for stills.
- **Preview is for feedback, not pixel-exact parity** — final encoding is ffmpeg.
  But because captions use the *same* `drawCaption`, caption WYSIWYG is exact.

**Risk (scoping input):** frame-accurate seeking of `<video>.currentTime` in a
rAF loop is janky in browsers and gets worse with multiple stacked video layers.
Trivial for stills. This is the main reason video ingestion is a later phase.
**Resolved 2026-07-20** (see the shipped-items blockquote above): the risk was
avoided rather than engineered around — seek exactly when paused/scrubbing,
but during playback let the video's own clock run and only reseek past a
drift threshold, instead of reseeking every rAF tick.

---

## 5. Captions (the resolved model)

Captions can't be drawn by the backend ffmpeg (no drawtext/freetype — verified
constraint). In a non-destructive world they also can't be fused into scene
images (crop/scale would distort them). So:

- **At export**, the frontend rasterizes each caption clip to a **transparent
  full-output-size PNG** (`captionOverlay.ts`, reusing `drawCaption`), tagged with
  its `startTime`/`duration`.
- These PNGs upload as overlay assets; the compiler adds them as a top `overlay`
  layer with `enable='between(t,start,end)'`.
- Brand font (Manrope) and styling stay entirely in the browser — no server font
  dependency, and preview matches export.
- Aspect-ratio change ⇒ just re-rasterize the caption PNGs for the new size.

**Phasing shortcut:** while there is no per-clip crop/scale and no motion
(Phases 1–2), a caption and its still occupy the same static span and *may* still
be fused for speed. **Captions must be split into their own overlay by Phase 3**
(when crop/scale/transform land), because from then on the underlying image moves
independently of the text.

---

## 6. Export pipeline (backend — C#, extends the ffmpeg path)

The new piece is a **`Timeline → ffmpeg` compiler** in `Greyvetro.Infrastructure`.
It is a **pure function** (`Timeline` → input args + `filter_complex` string), unit
-tested with xUnit — no ffmpeg or DOM needed to test it, which matters because
filter graphs are fiddly.

### Concept → ffmpeg mapping

| Timeline concept | ffmpeg mechanism |
|---|---|
| Trim (`inPoint`/`outPoint`) | per-input `-ss`/`-t`, or `trim`/`atrim` + `setpts`/`asetpts` |
| Placement (`startTime`) — base track | ordering in `concat` |
| Placement (`startTime`) — overlay layer | `overlay=x:y:enable='between(t,start,end)'` (+ `setpts` offset) |
| Placement (`startTime`) — audio | `adelay=<ms>` (silence pad) before `amix` |
| Crop | `crop` (from normalized → pixels) |
| Scale / position | `scale` + `overlay` x/y expressions |
| Layering (multiple visual tracks) | chained `overlay`, ordered by `zIndex` |
| Captions | `overlay` of the pre-rendered alpha PNG track (see §5) |
| Multi audio (voiceover + music/SFX) | `amix` with per-track `volume` weights |
| Fades | `afade` / `fade` from `fadeIn`/`fadeOut` |
| Ken Burns (photos) | `zoompan` (**verify build** — §9) |
| Transitions | `xfade` (video) / `acrossfade` (audio) (**verify build** — §9) |

### Build order for the compiler (each step is a regression gate)

1. **Single full-frame video track + single audio track** → must reproduce today's
   `FfmpegVideoRenderer` output **byte-for-similar**. This is the regression test
   that proves the model represents what exists.
2. Second visual layer (`overlay`).
3. Trim.
4. Crop / scale / position.
5. Multi-track audio (`amix` + `adelay` + `afade`).
6. Motion (`zoompan`), then transitions (`xfade`/`acrossfade`) — the hardest
   timestamp math, last.

Keep the compiler **side-effect free**; a thin `FfmpegTimelineRenderer` executes
the compiled command (reusing the existing ffmpeg-discovery + temp-dir + cleanup
logic already in `FfmpegVideoRenderer.cs`).

---

## 7. API contract

Evolve the existing `POST /render` (keep the name, keep multipart — consistent
with today):

```
POST /render   (multipart/form-data)
  timeline        : JSON  (the Timeline DTO — tracks, clips, transforms, trims, per-track audio)
  asset-<id>      : file  (each referenced MediaAsset blob: image / video / audio)
  caption-<clipId>: file  (pre-rendered transparent caption PNG, one per caption clip)
→ 200 video/mp4   |  503 if ffmpeg missing (existing behavior)
```

The backend deserializes `timeline`, maps to the `Timeline` domain aggregate,
runs the compiler, executes ffmpeg, streams the mp4. **No ffmpeg syntax crosses
the wire** — only structured data + media.

---

## 8. Module structure (corrected — FE is TS, BE is C#)

```
frontend-web/src/features/timeline/
  model/
    types.ts            # Timeline, Track, Clip, MediaAsset
    timelineOps.ts      # PURE: addClip, trimClip, moveClip, splitClip, reorder, setTransform…
  preview/
    Compositor.tsx      # canvas component
    useFrameComposite.ts# renderFrame(timeline, t)
    usePlayback.ts      # rAF loop + playhead
  editor/
    TimelineTrack.tsx
    TimelineClip.tsx    # drag + trim handles
    TrackHeader.tsx     # mute / volume / lock
    Playhead.tsx
  captions/
    drawCaption.ts      # extracted from composite.ts — shared by preview + export
    captionOverlay.ts   # rasterize caption clip -> transparent PNG for export
  export/
    exportService.ts    # build multipart (timeline JSON + asset blobs + caption PNGs), POST /render
  timelineRepo.ts       # IndexedDB persistence (new store, DB v4)

backend  (Clean Architecture — Domain ← Application ← Infrastructure ← API):
  Greyvetro.Domain/Entities/         Timeline.cs, Track.cs, Clip.cs, MediaAsset.cs
  Greyvetro.Domain/Interfaces/       IVideoRenderService  (extend with RenderAsync(Timeline, ct))
  Greyvetro.Application/Features/Render/  RenderTimelineCommand.cs (+ Handler)
  Greyvetro.Infrastructure/Ffmpeg/   FilterGraphCompiler.cs  (PURE, xUnit-tested)
  Greyvetro.Infrastructure/Ffmpeg/   FfmpegTimelineRenderer.cs (executes; reuses discovery/temp/cleanup)
  Greyvetro.API/Program.cs           POST /render  (multipart -> Timeline)
```

Register the new services in
`Greyvetro.Infrastructure/DependencyInjection/ServiceCollectionExtensions.cs`
(house convention). Once the compiler reproduces the old output, `RenderJob` /
`RenderScene` and the scene-based renderer can be retired.

---

## 9. ffmpeg capability gate (do this before Phases 5–6)

You were already bitten once by a filter missing from the Homebrew build
(drawtext / no freetype). Before any phase depends on these, confirm they're
compiled in:

```
ffmpeg -filters | grep -E 'zoompan|xfade|acrossfade|overlay|crop|amix|afade'
```

- `overlay`, `crop`, `scale`, `amix`, `afade`, `fade`, `adelay`, `concat` — core,
  effectively always present.
- `zoompan` (Ken Burns), `xfade` / `acrossfade` (transitions) — standard and very
  likely present, but **verify** rather than assume. If absent, the fallback is
  browser-side frame rendering for those effects (heavier) — a scope decision, so
  find out early.
- `subtitles`/`ass` are **not** an escape hatch for captions — libass needs the
  same freetype the build lacks. Alpha-PNG overlays (§5) remain the path.

---

## 10. Persistence

Timeline documents + asset blobs persist in **IndexedDB** exactly like storyboard
data does today (`sceneRepo.ts` pattern: metadata record + blob per asset).
Adding a `timelines` store bumps the DB from **v3 → v4** in `core/db.ts`
(house convention: bump the version when adding a store). Undo/redo is a history
stack of `Timeline` snapshots — near-free given `timelineOps.ts` is pure. All
still **browser-local**; server-side persistence/collaboration is a separate BA
item and is **not** a blocker for this feature.

---

## 11. Phased roadmap (revised)

Each phase is independently demoable and a strict improvement over today's linear
storyboard.

- **Phase 1 — Model + read-only timeline + regression.** Ship the types;
  storyboard seeds a `Timeline` (photo + audio + caption tracks) instead of a flat
  scene list; render tracks as horizontal bars (no editing); backend compiler step
  1 reproduces today's mp4. *Goal: prove the model represents what exists.*
- ✅ **Phase 2 — Trim + reorder + split (shipped 2026-07-18).** The read-only
  timeline became an interactive editor (`TimelineEditor.tsx`): click-select,
  HTML5 drag-to-reorder within a lane, pointer trim handles on both edges
  (stills change `duration`; video also moves `inPoint`/`outPoint`, clamped to
  the asset length), split at the playhead (`S`), delete (`Del`, guarded against
  removing the last visual clip), a click-to-scrub playhead, and **Play/Pause**
  playback — a rAF clock advances the playhead and drives the synced voiceover,
  and a live frame+caption preview swaps stills as it plays (video shows its
  poster at this point; frame-accurate video preview shipped later — see the
  blockquote near the top of this doc). Pure ops
  (`reanchor`/`moveClip`/`trimClip`/`splitClip`/
  `deleteClip` in `timelineOps.ts`) keep the base track contiguous (it's a
  `concat`) and re-derive the display-only caption lane by source id. **The saved
  timeline is now the source of truth** — the storyboard only seeds it the first
  time; a **🔄 Re-sync** action rebuilds photo/caption/audio tracks from the
  current storyboard (keeping added videos). No backend change: the compiler
  already ordered by `startTime` and honored `duration`/`inPoint`/`outPoint`; a
  new xUnit test locks that a split (two clips over one source) emits an input
  per clip. Captions stay fused this phase (overlay split is Phase 3). Verified:
  backend 12/12, `tsc -b && vite build` clean, 20/20 pure-ops assertions.
- ✅ **Phase 3 — Layering + transform (captions split here).** Add/remove tracks,
  z-index layering in preview + compiler, crop/position/scale/rotation on the
  selected clip. **Captions moved to their own alpha-overlay track** (§5),
  because images now transform independently. Shipped in three slices:
  - ✅ **3a — Caption alpha-overlay split (shipped 2026-07-18).** `drawCaption` was
    extracted from `storyboard/composite.ts` into a shared `captions/drawCaption.ts`
    (with `renderCaptionOverlay`, which rasterizes a caption clip to a transparent
    full-output PNG). The timeline export now composites photo frames *without*
    captions and ships each caption clip as a `caption-<clipId>` part; the C#
    `FilterGraphCompiler` gained a `captionPaths` argument and composites each as a
    top `overlay=0:0:enable='between(t,start,end)'` layer, its inputs appended after
    the audio inputs so the audio stream indices (and all golden-string tests) stay
    intact — with no caption PNGs it maps `[vout]` exactly as before. Verified with
    a real `/render` POST (h264/aac 1080×1920, caption box present at t=1, absent at
    t=3, frame-sampled). Backend 18/18, `tsc -b && vite build` clean. Unblocks 3b.
  - ✅ **3b — Per-clip transform (shipped 2026-07-20).** Reframe (zoom/pan) landed
    first, via the already-modeled `Clip.Crop`: a normalized source crop applied
    before the cover-fit (`CropPrefix` in `FilterGraphCompiler`), a Zoom + Pan X/Y
    inspector (`cropFromZoomPan`/`zoomPanFromCrop` in `timelineOps.ts`), and an
    approximate CSS preview. *(That slice shipped in the same commit as the
    `@greyvetro/ui` design-system work, under a message that only described the
    latter — worth knowing if you go looking for it in history.)* Rotation
    (`Clip.Rotation`, degrees) closed out the phase: the compiler auto-computes the
    smallest uniform zoom that keeps a tilted W×H frame gap-free —
    `k = cos θ + (H/W)·sin θ` — before `scale=k·w:k·h,rotate=θ*PI/180:ow=w:oh=h`
    crops back down, so no black corners appear at any angle the ±45° Tilt slider
    allows. Verified: backend +6 golden-string tests, and a real `/render` POST —
    every corner (and center) of a 15°-tilted frame sampled solid background color,
    no black.
  - ✅ **3c — Layering (shipped 2026-07-20).** Any photo/video track above the base
    zIndex composites as a PiP/logo-style overlay: scaled to a normalized
    `Clip.Scale` (source aspect kept via ffmpeg `-2`), placed at a normalized
    `Clip.Position`, gated `enable='between(t,start,end)'`, ordered by zIndex —
    under the caption layer (overlay inputs land right after audio, captions after
    those, so none of the existing stream-index golden tests moved). Web: **🖼 Add
    overlay** on the Timeline tab adds an image as its own track (one clip
    spanning the current timeline length by default, a persistent-watermark
    default); selecting it opens a Position X/Y + Size inspector, and the live
    preview composites it over the background frame. Overlay clips are edited like
    music — one clip, end-trim only, removed as a whole track — since they don't
    join the base track's `concat`; `timelineOps.ts` now distinguishes the base
    visual track from overlay tracks by zIndex throughout
    (`reanchor`/`moveClip`/`splitClip`/`deleteClip`, `visualEnd`, and the "keep at
    least one clip" guard are all scoped to the base only, so an overlay can't
    block deleting the last scene or skew where an appended video lands).
    `mergeAddedMedia` carries overlay tracks across a storyboard re-sync, same as
    video/music. Verified: backend 26/26 total (8 new tests across 3b/3c),
    `tsc -b && vite build` + lint clean, and a real `/render` POST — a PiP pixel
    sampled background color before its window, overlay color inside it, and
    background color again after.
- ✅ **Phase 4 — Audio (shipped 2026-07-18, ahead of Phase 3 per the "light
  editing" priority).** Multiple audio tracks (voiceover + music/SFX), per-track
  volume/mute, fade in/out. The compiler grew a mix path: each unmuted audio clip
  is an input-seek-trimmed input, gets `volume` (clip × track gain), `afade`
  in/out, and `adelay` for placement, then `amix=inputs=N:normalize=0` + `apad`
  so `-shortest` keeps the visual length as master. The single plain-voiceover
  case stays on the legacy direct-map path (byte-for-similar; muting the only
  extra track falls back to it). Web: **🎵 Add music** (probe duration, blob in
  the `timelineAssets` store, clip clamped to timeline length at a default 0.3
  gain), music clips are selectable with an inspector (track volume, mute, fade
  in/out, remove); `mergeVideoTracks` became `mergeAddedMedia` so music survives
  re-sync too. Verified: backend 15/15, build/lint clean, 16/16 audio-ops
  assertions, and the exact `volume,afade,adelay,amix,apad` graph rendered by
  ffmpeg end-to-end (h264+aac, 9.0s master length).
- ✅ **Phase 5 — Motion (shipped 2026-07-20).** Ken Burns pan/zoom on stills via keyframed
  `Clip.Motion.From/To` (each a `{ zoom, panX, panY }`), animated linearly across the clip's full
  duration by ffmpeg `zoompan`. The exact recipe was verified empirically against ffmpeg 8.1 before
  wiring it into the compiler (three dead ends first): `-loop 1 -t <duration> -i` (the pattern every
  other still uses) makes zoompan re-run its whole `d`-frame cycle **once per demuxed input frame**
  (100 input frames × d=120 → 12,000 output frames) — the fix is an **unbounded** `-loop 1 -i` (no
  input-side `-t`) so zoompan consumes exactly one input frame and produces `d` frames from it, self-
  terminating via a trailing `trim=end_frame=<d>,setpts=PTS-STARTPTS` **inside the filter graph**
  (an external `-t`/`-frames:v` isn't an option here — this clip's stream feeds a shared `concat`
  alongside others, not a standalone output; without the in-graph trim it never emits EOF and the
  whole render hangs). The source is pre-cover-fit to 3× the output size (`KenBurnsHeadroom`) before
  zoompan so the crop window stays at native resolution even at max zoom (matches the existing
  reframe control's `MAX_ZOOM=3`); `x`/`y` reference zoompan's own `zoom` variable (current frame's
  evaluated `z`) to place the pan center, clamped in-bounds with `min`/`max`. Motion is stills-only —
  a video-source clip keeps its normal `-ss`/`-t` trim, Motion is ignored — and mutually exclusive
  with static `Crop`/`Rotation` on the same clip (identical `From`/`To` keyframes are a no-op that
  falls back to the cheaper static chain; an animated clip's static crop/rotation are ignored, not
  combined — later refinement if ever needed). Web: the per-clip transform inspector gained a
  **🎥 Add motion** toggle that swaps the static Zoom/Pan/Tilt controls for paired **Start**/**End**
  keyframe editors (`setMotion`/`DEFAULT_MOTION` in `timelineOps.ts`); the live preview lerps
  zoom/pan by the playhead's position within the clip (`(ph - startTime) / duration`, clamped 0–1) so
  scrubbing shows the animation, reusing the same CSS-transform preview path as the static reframe
  (motion takes precedence when both are present, mirroring the compiler). Verified: backend 31/31
  (5 new tests — lerped zoompan expressions, the no-`-t` input args, the identical-keyframe no-op
  fallback, a video-source clip ignoring Motion), `tsc -b && vite build` + lint clean, and a real
  `/render` POST — a 4s/120-frame clip visibly zoomed + panned between its first and last frame.
- ✅ **Phase 6 — Transitions + polish (shipped 2026-07-20).** Video crossfades
  (`xfade`), timeline zoom + snapping, and an undo/redo history stack.
  - **Transitions.** `Clip.TransitionIn` (`{ style: dissolve|fadeToBlack, duration
    }`, both `Timeline.cs` and `types.ts`) describes a crossfade into a base-track
    clip from the one immediately before it. The compiler groups cut-joined clips
    into segments (unchanged `concat`, still byte-identical with zero transitions
    — the regression gate) and folds segments pairwise with `xfade`
    (`AppendBaseTrackAssembly` in `FilterGraphCompiler.cs`), computing each
    `offset` against the *running combined* duration so multiple transitions
    chain correctly. `dissolve` → xfade type `fade` (direct cross-dissolve);
    `fadeToBlack` → `fadeblack`. Duration is clamped server-side to 90% of the
    *shorter* adjacent clip (dropped below `MinTransitionDuration = 0.1s`) since
    a crossfade can't outlast either shot — the client (`timelineOps.ts`
    `clampTransitionDuration`/`MIN_TRANSITION`) mirrors the exact same formula so
    the editor's re-anchored timeline always matches what renders. Because an
    `xfade` overlaps two clips, the base track's effective length shrinks by
    each transition's duration — `reanchor`'s `anchorVisual` pulls each
    subsequent clip's `startTime` back by its (clamped) overlap, which is also
    why the timeline's total duration can be shorter than the sum of clip
    durations from this phase on. Web: a small ⤭ badge sits on the boundary
    between adjacent base-track clips (only rendered where both clips are long
    enough to support one); clicking it opens an inspector (style buttons +
    duration slider + remove), and the clip bars visually overlap by the
    transition's duration once set (their `left`/`width` are still plain
    `startTime`/`duration` percentages, so the shrink is automatically WYSIWYG).
    `splitClip` clears `transitionIn` on the second half (the new interior cut
    is a plain cut, not a repeat of the original boundary's transition).
    Verified: 5 new xUnit cases (two-clip dissolve, mixed cut+transition segment
    grouping, fadeToBlack type mapping, over-long clamped to 90%, too-short
    dropped) — 36/36 backend total — plus a real `/render` POST: total duration
    correctly 3+3−1=5s for two 3s clips with a 1s dissolve, frame-sampled pure
    red before the transition window, a genuine ~50/50 red/blue blend at the
    window's midpoint, pure blue after. **Scope cut:** only base-track (photo/
    video) crossfades — no audio `acrossfade` (this product's audio model rarely
    has multiple sequential same-track clips; voiceover is one clip, music
    tracks span independently) and no fade-from/to-black on the very first/last
    clip (no predecessor to overlap with) — both left as later refinements, not
    wired up.
  - **Zoom + snapping** (frontend-only). `TimelineEditor` replaced the old
    percentage-of-container clip layout with an explicit pixels-per-second
    (`pxPerSecond`, 20–400 range, 🔍−/🔍+/Fit chips) driving a fixed content
    width (`total * pxPerSecond`); clip/tick/playhead positioning stayed
    percentage-based (still correct since it's now a percentage of an explicit
    pixel-width parent) — no coordinate math changed. Track labels moved to a
    separate non-scrolling `.tl-labels` column beside a new `.tl-scroll`
    container so only the ruler+lanes scroll horizontally, labels stay pinned.
    Trimming a clip edge now snaps the dragged edge to the nearest of {0, the
    timeline end, the playhead, every other clip's start/end across tracks}
    within an 8px screen threshold (converted to seconds via `pxPerSecond`),
    showing a `.tl-snap-guide` line when snapped. Verified interactively: a trim
    drag landing a few px short of another clip's start time snapped to the
    exact value rather than the raw pixel-derived one.
  - **Undo/redo.** `useTimelineHistory.ts` — a ref-based history stack (past/
    future arrays of `Timeline` snapshots, capped at 100), *not* `useState` for
    the stacks: React 18 Strict Mode double-invokes `setState` updater
    functions to surface impure ones, which would silently double-push history
    if past/future were mutated inside a updater. A `useReducer` counter forces
    the re-render once the refs are already updated; `load`/`set`/`undo`/`redo`
    are wrapped in `useCallback` with empty deps so they're stable enough to
    list in `TimelineScreen`'s seeding-effect dependency array. `load()` resets
    history (initial project seed / project switch); `set()` is what every
    edit path — the editor's `onChange`, the video/music/overlay file handlers,
    and re-sync — now goes through instead of a bare `setState`. Cmd/Ctrl+Z
    (Shift for redo) plus toolbar Undo/Redo buttons, both disabled at the
    stack's edge. **Known v1 limitation, not engineered around:** continuous
    slider drags (volume, fade, zoom/pan/tilt, transition duration, overlay
    position/scale) call `onChange` on every `input` tick, so dragging one
    slider produces many undo entries instead of one coalesced step — acceptable
    for v1, a later refinement if it proves annoying in practice.
  - Verified overall: backend 36/36, `tsc -b && vite build` + lint clean (zero
    new warnings), and the interactive checks above driven live in Chrome.
- **Later / separate scope — Video-clip ingestion.** Upload real video as source
  media (probe duration/dimensions, frame-seek preview). Deferred because it's
  greenfield and drives the hardest preview-performance problems.

---

## 12. Open questions — with recommended v1 answers (override if needed)

The first draft asked these; here are the calls I'd make for the "best shot" v1,
so building isn't blocked:

1. **Max tracks?** → **Cap v1 at 2 visual + 2 audio + 1 caption.** Keeps the
   compiler graph and UI tractable; lift later.
2. **Trim granularity?** → **Second-level (fine) for v1**, since content is stills
   (no source frame rate to honor). Frame-accuracy becomes real only with video
   ingestion (deferred).
3. **Does Storyboard still auto-generate?** → **Yes.** Storyboard seeds the
   timeline; the editor is refinement/polish, not from-scratch assembly. Preserves
   the automation value prop.
4. **Photos: Ken Burns by default?** → **Static in v1, Ken Burns in Phase 5** as an
   opt-in per clip (keyframed `motion`). Avoids committing the model to keyframes
   before the editor basics are solid.

---

## 13. Top risks

- **Compiler complexity** — `overlay`/`amix` graphs with `enable`/`adelay`/timestamp
  offsets are error-prone. Mitigation: pure compiler + xUnit golden-string tests +
  the "reproduce today's output" regression gate.
- **Preview performance with real video** — the reason video ingestion is deferred.
- **ffmpeg build gaps** — mitigated by the §9 capability gate before Phases 5–6.
- **Caption/transform coupling** — mitigated by forcing the caption-overlay split at
  Phase 3, not later.
```
