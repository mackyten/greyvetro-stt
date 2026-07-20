import { CAPTION_FONT_SPEC, drawCaption } from '../timeline/captions/drawCaption';

/**
 * Client-side frame compositing for the mp4 export: each scene becomes a full
 * 1080x1920 JPEG with the image cover-fitted and (optionally) the narration burned
 * in as a caption. Done in the browser (not ffmpeg drawtext) so captions use the
 * app's Manrope font and the backend needs no freetype support.
 *
 * Caption drawing is shared with the timeline caption-overlay rasterizer via
 * `drawCaption` (docs/timeline-editor-plan.md §5). The storyboard path still fuses
 * captions in (`captions: true`); the timeline path passes `false` and composites a
 * separate alpha-PNG overlay track instead.
 */

const W = 1080;
const H = 1920;

export async function compositeFrame(
  image: Blob | null,
  narration: string,
  captions: boolean,
): Promise<Blob> {
  await document.fonts.load(CAPTION_FONT_SPEC).catch(() => {});
  await document.fonts.load("96px 'Material Icons'").catch(() => {});
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');

  ctx.fillStyle = '#12151A';
  ctx.fillRect(0, 0, W, H);

  if (image) {
    const bmp = await createImageBitmap(image);
    const scale = Math.max(W / bmp.width, H / bmp.height);
    const dw = bmp.width * scale;
    const dh = bmp.height * scale;
    ctx.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
    bmp.close();
  } else {
    ctx.fillStyle = '#2E343D';
    ctx.font = "96px 'Material Icons'";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('movie', W / 2, H / 2);
  }

  if (captions && narration.trim()) drawCaption(ctx, narration.trim(), W, H);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed.'))),
      'image/jpeg',
      0.92,
    ),
  );
}
