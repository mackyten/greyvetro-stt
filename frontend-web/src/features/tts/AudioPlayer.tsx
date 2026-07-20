import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../core/Icon';

function fmt(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  src: string;
  downloadName: string;
  autoPlay?: boolean;
  showDownload?: boolean;
}

export function AudioPlayer({ src, downloadName, autoPlay = true, showDownload = true }: Props) {
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
    if (autoPlay) audio.play().then(() => setPlaying(true)).catch(() => {});
    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
    };
    // autoPlay is intentionally captured once per src
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

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
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
          <Icon name={playing ? 'pause' : 'play_arrow'} />
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
          <Icon name="download" /> Download MP3
        </a>
      )}
    </div>
  );
}
