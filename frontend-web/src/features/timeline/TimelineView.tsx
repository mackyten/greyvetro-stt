import { timelineDuration, type Timeline, type TrackType } from './model/types';

/** Lane display order (top → bottom) and labels. */
const LANE_ORDER: TrackType[] = ['video', 'photo', 'caption', 'audio'];
const LANE_LABEL: Record<TrackType, string> = {
  video: 'Video',
  photo: 'Photo',
  caption: 'Captions',
  audio: 'Audio',
};

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function tickStep(total: number): number {
  if (total <= 15) return 2;
  if (total <= 40) return 5;
  if (total <= 90) return 10;
  return 15;
}

/**
 * Read-only timeline: each track becomes a lane, each clip a bar positioned by
 * startTime/duration over the timeline total. Phase 1 is view-only (no drag/trim) — it
 * proves the seeded model represents the storyboard before the editor lands.
 */
export function TimelineView({
  timeline,
  imageUrls,
}: {
  timeline: Timeline;
  imageUrls: Record<string, string>;
}) {
  const total = Math.max(timelineDuration(timeline), 0.001);
  const tracks = [...timeline.tracks].sort(
    (a, b) => LANE_ORDER.indexOf(a.type) - LANE_ORDER.indexOf(b.type),
  );

  const step = tickStep(total);
  const ticks: number[] = [];
  for (let t = 0; t <= total + 0.001; t += step) ticks.push(t);

  return (
    <div className="tl card">
      <div className="tl-ruler">
        {ticks.map((t) => (
          <span key={t} className="tl-tick mono" style={{ left: `${(t / total) * 100}%` }}>
            {fmt(t)}
          </span>
        ))}
      </div>

      {tracks.map((track) => (
        <div key={track.id} className="tl-lane">
          <div className="tl-lane-label">{LANE_LABEL[track.type]}</div>
          <div className="tl-lane-track">
            {[...track.clips]
              .sort((a, b) => a.startTime - b.startTime)
              .map((clip, i) => {
                const left = (clip.startTime / total) * 100;
                const width = (clip.duration / total) * 100;
                const label =
                  track.type === 'caption'
                    ? clip.text ?? ''
                    : track.type === 'audio'
                      ? 'Voiceover'
                      : track.type === 'video'
                        ? `🎬 Video ${i + 1}`
                        : `Scene ${i + 1}`;
                const thumb = imageUrls[clip.sourceId];
                const visual = track.type === 'photo' || track.type === 'video';
                return (
                  <div
                    key={clip.id}
                    className={`tl-clip tl-clip-${track.type}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${label} · ${fmt(clip.startTime)}–${fmt(clip.startTime + clip.duration)}`}
                  >
                    {visual && thumb && <img src={thumb} alt="" />}
                    <span className="tl-clip-label">{label}</span>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
