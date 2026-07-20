import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

function fmt(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface AudioPlayerProps {
  /** Audio source URL (or object URL) to play. */
  src: string;
  /** Filename used for the download link. */
  downloadName: string;
  /** Start playback automatically when the source loads. */
  autoPlay?: boolean;
  /** Show the "Download MP3" link below the transport. */
  showDownload?: boolean;
}

/**
 * The brand audio player: a gradient play/pause button, a click-to-seek
 * scrubber with a gradient fill, a mono time readout, and an optional download
 * link. Mirrors the app's `AudioPlayer`.
 * @category Media
 */
export function AudioPlayer({
  src,
  downloadName,
  autoPlay = true,
  showDownload = true,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;
    const onTime = () => setPosition(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => {
      setPlaying(false);
      setPosition(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);
    if (autoPlay)
      audio
        .play()
        .then(() => setPlaying(true))
        .catch(() => {});
    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  };

  const seek = (e: ReactMouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = frac * duration;
    setPosition(audio.currentTime);
  };

  const progress = duration ? (position / duration) * 100 : 0;

  return (
    <div className="player">
      <div className="player-controls">
        <button className="play-btn" onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="scrubber" onClick={seek}>
          <div className="track">
            <div className="fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <span className="player-time">
          {fmt(position)} / {fmt(duration)}
        </span>
      </div>
      {showDownload && (
        <a className="download-btn" href={src} download={downloadName}>
          ⬇ Download MP3
        </a>
      )}
    </div>
  );
}
