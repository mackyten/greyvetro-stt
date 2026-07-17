/** Browser media probing/thumbnailing helpers for the timeline (no server round-trip). */

/** Intrinsic length of an audio blob via a throwaway <audio> element. 0 if unreadable. */
export function audioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement('audio');
    const url = URL.createObjectURL(blob);
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const d = el.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    el.src = url;
  });
}

export interface VideoMeta {
  duration: number;
  width: number;
  height: number;
}

/** Duration + pixel dimensions of a video blob. */
export function probeVideo(blob: Blob): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('video');
    const url = URL.createObjectURL(blob);
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const meta = {
        duration: Number.isFinite(el.duration) ? el.duration : 0,
        width: el.videoWidth,
        height: el.videoHeight,
      };
      URL.revokeObjectURL(url);
      if (meta.duration <= 0 || meta.width === 0)
        reject(new Error('Could not read this video (unsupported format?).'));
      else resolve(meta);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this video (unsupported format?).'));
    };
    el.src = url;
  });
}

/** A single poster frame (near the start) of a video blob, as a JPEG. null if capture fails. */
export function capturePoster(blob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    const url = URL.createObjectURL(blob);
    el.preload = 'auto';
    el.muted = true;
    const done = (result: Blob | null) => {
      URL.revokeObjectURL(url);
      resolve(result);
    };
    el.onloadeddata = () => {
      // Nudge past frame 0 so we don't grab a black frame.
      el.currentTime = Math.min(0.1, (el.duration || 1) / 2);
    };
    el.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = el.videoWidth || 320;
        canvas.height = el.videoHeight || 240;
        const ctx = canvas.getContext('2d');
        if (!ctx) return done(null);
        ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => done(b), 'image/jpeg', 0.7);
      } catch {
        done(null);
      }
    };
    el.onerror = () => done(null);
    el.src = url;
  });
}
