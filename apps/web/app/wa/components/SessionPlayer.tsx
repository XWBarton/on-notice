"use client";

import { useState, useRef } from "react";

export function SessionPlayer({ url, durationSec }: { url: string; durationSec?: number | null }) {
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function getAudio() {
    if (!audioRef.current) {
      const a = new Audio(url);
      audioRef.current = a;
      a.onended = () => setPlaying(false);
    }
    return audioRef.current;
  }

  function toggle() {
    const a = getAudio();
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play();
      setPlaying(true);
      setStarted(true);
    }
  }

  function skip(secs: number) {
    const a = getAudio();
    a.currentTime = Math.max(0, a.currentTime + secs);
    if (!playing) {
      a.play();
      setPlaying(true);
      setStarted(true);
    }
  }

  const duration = durationSec
    ? (() => {
        const h = Math.floor(durationSec / 3600);
        const m = Math.floor((durationSec % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
      })()
    : null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={toggle}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-full px-4 py-1.5 transition-colors"
      >
        {playing ? (
          <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2" y="1" width="3" height="10" rx="0.5" />
            <rect x="7" y="1" width="3" height="10" rx="0.5" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="currentColor">
            <path d="M3 2l7 4-7 4V2z" />
          </svg>
        )}
        {playing ? "Pause" : "Play full session"}
      </button>

      {started && (
        <>
          <button
            onClick={() => skip(-30)}
            title="Rewind 30s"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-full px-2.5 py-1.5 transition-colors"
          >
            ← 30s
          </button>
          <button
            onClick={() => skip(30)}
            title="Skip 30s"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-full px-2.5 py-1.5 transition-colors"
          >
            30s →
          </button>
        </>
      )}

      {duration && (
        <span className="text-xs text-gray-400">{duration}</span>
      )}
    </div>
  );
}
