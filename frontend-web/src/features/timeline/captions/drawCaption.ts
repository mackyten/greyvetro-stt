/**
 * Brand caption rendering — the single source of caption pixels, shared by the storyboard frame
 * compositor (`storyboard/composite.ts`) and the timeline caption-overlay rasterizer so preview
 * and export can't drift (docs/timeline-editor-plan.md §5). Captions can't be drawn by the backend
 * ffmpeg (no drawtext/freetype), so they're rendered here in the app's Manrope font.
 *
 * The spacing/font constants are tuned for the 1080×1920 output — v1's only target. Position
 * formulas take w/h so a different aspect ratio still lands the box correctly; per-resolution font
 * scaling is a later concern (§5).
 */

/** Manrope caption spec; callers preload it before rasterizing so the first frame isn't a fallback. */
export const CAPTION_FONT_SPEC = '600 54px Manrope, sans-serif';

/** Draw the wrapped, boxed caption onto an existing canvas context sized w×h. */
export function drawCaption(ctx: CanvasRenderingContext2D, text: string, w: number, h: number) {
  ctx.font = CAPTION_FONT_SPEC;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const maxWidth = w - 200;
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  const lineHeight = 74;
  const padX = 40;
  const padY = 30;
  const blockHeight = lines.length * lineHeight;
  const bottom = h - 320;
  const top = bottom - blockHeight;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect(w / 2 - widest / 2 - padX, top - padY, widest + padX * 2, blockHeight + padY * 2, 20);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  lines.forEach((l, i) => ctx.fillText(l, w / 2, top + (i + 0.78) * lineHeight));
}

/**
 * Rasterize a caption clip to a transparent full-output PNG for the ffmpeg overlay track
 * (docs/timeline-editor-plan.md §5). PNG (not JPEG) preserves the alpha the compiler's `overlay`
 * needs. Blank text yields a fully transparent frame (the caller should skip those).
 */
export async function renderCaptionOverlay(text: string, w = 1080, h = 1920): Promise<Blob> {
  await document.fonts.load(CAPTION_FONT_SPEC).catch(() => {});
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');

  ctx.clearRect(0, 0, w, h);
  if (text.trim()) drawCaption(ctx, text.trim(), w, h);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Caption overlay export failed.'))),
      'image/png',
    ),
  );
}
