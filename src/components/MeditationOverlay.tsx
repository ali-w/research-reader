import { useState, useEffect, useRef } from 'react';

const HOSTED_TRACKS: string[] = [
  'https://storage.googleapis.com/research-reader-sounds/leberch-christian-439968.mp3',
  'https://storage.googleapis.com/research-reader-sounds/leberch-meditation-510292.mp3',
  'https://storage.googleapis.com/research-reader-sounds/mondamusic-meditation-491684.mp3',
  'https://storage.googleapis.com/research-reader-sounds/sigmamusicart-meditation-music-368634.mp3',
  'https://storage.googleapis.com/research-reader-sounds/sountrixaudio-meditation-background-434654.mp3'
];

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

function startAmbient(ctx: AudioContext) {
  const merger = ctx.createChannelMerger(2);
  merger.connect(ctx.destination);

  // Binaural delta beat: 200 Hz left, 201 Hz right → 1 Hz perceived beat (heartbeat pace)
  const carrier = 200;
  const beat = 1;
  [carrier, carrier + beat].forEach((freq, channel) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.18;
    osc.connect(gain);
    gain.connect(merger, 0, channel);
    osc.start();
  });

  // Filtered pink-ish noise underneath (both channels)
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 350;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.03;
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(merger, 0, 0);
  noiseGain.connect(merger, 0, 1);
  noise.start();
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
  const ambientCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (navigator.onLine && HOSTED_TRACKS.length > 0) {
      const track = HOSTED_TRACKS[Math.floor(Math.random() * HOSTED_TRACKS.length)];
      const audio = new Audio(track);
      audio.loop = true;
      audio.volume = 0.5;
      audioRef.current = audio;
      audio.play().catch(() => {
        // Hosted track failed — fall back to generated ambient
        audio.pause();
        audioRef.current = null;
        const ctx = new AudioContext();
        ambientCtxRef.current = ctx;
        startAmbient(ctx);
      });
    } else {
      const ctx = new AudioContext();
      ambientCtxRef.current = ctx;
      startAmbient(ctx);
    }

    playBell();

    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      ambientCtxRef.current?.close();
      ambientCtxRef.current = null;
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
          ambientCtxRef.current?.close();
          ambientCtxRef.current = null;
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
      if (audioRef.current) {
        if (next) audioRef.current.play().catch(() => {});
        else audioRef.current.pause();
      }
      if (ambientCtxRef.current) {
        if (next) ambientCtxRef.current.resume();
        else ambientCtxRef.current.suspend();
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
