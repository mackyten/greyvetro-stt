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
> photo+video render (photo span still, video span motion, frame-diffed). Still
> deferred: frame-accurate `<video>` scrub preview, per-clip trim UI, mixing the
> video's own audio. Phases 2–6 below are the remaining work.

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
- **Phase 2 — Trim + reorder + split.** Drag to reorder, trim handles
  (`inPoint`/`outPoint`/`duration`), split at playhead; basic frame-accurate
  scrub in preview. Captions may stay fused this phase.
- **Phase 3 — Layering + transform (captions split here).** Add/remove tracks,
  z-index layering in preview + compiler, crop/position/scale on the selected
  clip. **Captions move to their own alpha-overlay track now** (§5), because
  images start transforming independently.
- **Phase 4 — Audio.** Multiple audio tracks (voiceover + music/SFX), per-track
  volume/mute, fade in/out; `amix` + `adelay` + `afade` in the compiler.
- **Phase 5 — Motion.** Ken Burns (`zoompan`) on photos via keyframed
  `motion.from/to` (gated on §9).
- **Phase 6 — Transitions + polish.** `xfade`/`acrossfade` (gated on §9),
  timeline snapping/zoom, undo/redo history stack.
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
