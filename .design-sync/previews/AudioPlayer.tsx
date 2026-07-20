import { AudioPlayer } from '@greyvetro/ui';

// A tiny valid silent WAV so the transport renders without network/audio in the
// preview environment.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

export function Player() {
  return (
    <div style={{ width: 380 }}>
      <AudioPlayer src={SILENT_WAV} downloadName="voiceover.mp3" autoPlay={false} />
    </div>
  );
}

export function NoDownload() {
  return (
    <div style={{ width: 380 }}>
      <AudioPlayer src={SILENT_WAV} downloadName="voiceover.mp3" autoPlay={false} showDownload={false} />
    </div>
  );
}
