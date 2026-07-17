/**
 * Client-side frame compositing for the mp4 export: each scene becomes a full
 * 1080x1920 JPEG with the image cover-fitted and the narration burned in as a
 * caption. Done in the browser (not ffmpeg drawtext) so captions use the app's
 * Manrope font and the backend needs no freetype support.
 */

const W = 1080;
const H = 1920;
const CAPTION_FONT = '600 54px Manrope, sans-serif';

export async function compositeFrame(
  image: Blob | null,
  narration: string,
  captions: boolean,
): Promise<Blob> {
  await document.fonts.load(CAPTION_FONT).catch(() => {});
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
    ctx.font = '600 96px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎬', W / 2, H / 2);
  }

  if (captions && narration.trim()) drawCaption(ctx, narration.trim());

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed.'))),
      'image/jpeg',
      0.92,
    ),
  );
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string) {
  ctx.font = CAPTION_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const maxWidth = W - 200;
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
  const bottom = H - 320;
  const top = bottom - blockHeight;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect(W / 2 - widest / 2 - padX, top - padY, widest + padX * 2, blockHeight + padY * 2, 20);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + (i + 0.78) * lineHeight));
}
