import { useState, useEffect, useRef } from 'react';

const HOSTED_TRACKS: string[] = [
  'https://storage.googleapis.com/research-reader-sounds/leberch-christian-439968.mp3',
  'https://storage.googleapis.com/research-reader-sounds/leberch-meditation-510292.mp3',
  'https://storage.googleapis.com/research-reader-sounds/mondamusic-meditation-491684.mp3',
  'https://storage.googleapis.com/research-reader-sounds/sigmamusicart-meditation-music-368634.mp3',
  'https://storage.googleapis.com/research-reader-sounds/sountrixaudio-meditation-background-434654.mp3'
];

const OFFLINE_TRACK = '/sounds/meditation-fallback.mp3';

function pickTrack(): string {
  if (navigator.onLine && HOSTED_TRACKS.length > 0) {
    return HOSTED_TRACKS[Math.floor(Math.random() * HOSTED_TRACKS.length)];
  }
  return OFFLINE_TRACK;
}

function playBell() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 432;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3);
    osc.start();
    osc.stop(ctx.currentTime + 3);
    osc.onended = () => ctx.close();
  } catch {
    // AudioContext not available
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface Props {
  duration: number;
  onClose: () => void;
}

export default function MeditationOverlay({ duration, onClose }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(duration);
  const [running, setRunning] = useState(true);
  const [done, setDone] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(pickTrack());
    audio.loop = true;
    audio.volume = 0.5;
    audioRef.current = audio;
    audio.play().catch(() => {});
    playBell();
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!running || done) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          setRunning(false);
          setDone(true);
          audioRef.current?.pause();
          playBell();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, done]);

  function toggleRunning() {
    if (done) return;
    setRunning((r) => {
      const next = !r;
      if (next) {
        audioRef.current?.play().catch(() => {});
      } else {
        audioRef.current?.pause();
      }
      return next;
    });
  }

  return (
    <div className="meditation-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="meditation-panel">
        <div className="meditation-timer">
          {done ? 'Done' : formatTime(secondsLeft)}
        </div>
        <div className="meditation-subtitle">
          {done ? 'Session complete' : running ? 'Breathe...' : 'Paused'}
        </div>
        <div className="meditation-controls">
          {!done && (
            <button className="meditation-toggle-btn" onClick={toggleRunning}>
              {running ? '⏸' : '▶'}
            </button>
          )}
          <button className="meditation-end-btn" onClick={onClose}>
            End
          </button>
        </div>
      </div>
    </div>
  );
}
