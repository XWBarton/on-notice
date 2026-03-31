"use client";

import { useRef, useState, useEffect } from "react";

export interface Chapter {
  startTime: number;
  title: string;
  url?: string;
}

interface PodcastPlayerProps {
  audioUrl: string;
  chapters: Chapter[];
  parliamentId?: string;
}

// House of Representatives: green; Senate: red
function getAccent(parliamentId?: string) {
  if (parliamentId === "fed_sen") {
    return { bg: "#b91c1c", bgHover: "#991b1b", light: "#fef2f2", border: "#fecaca", text: "#b91c1c", active: "#7f1d1d" };
  }
  return { bg: "#15803d", bgHover: "#166534", light: "#f0fdf4", border: "#bbf7d0", text: "#15803d", active: "#14532d" };
}

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PodcastPlayer({ audioUrl, chapters, parliamentId }: PodcastPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [loading, setLoading] = useState(false);

  const accent = getAccent(parliamentId);

  const activeIndex = chapters.reduce((best, ch, i) => {
    return ch.startTime <= currentTime ? i : best;
  }, 0);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audio.preload = "metadata";
    audioRef.current = audio;

    audio.onloadedmetadata = () => setDuration(audio.duration);
    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.buffered.length > 0) {
        setBuffered(audio.buffered.end(audio.buffered.length - 1));
      }
    };
    audio.onwaiting = () => setLoading(true);
    audio.oncanplay = () => setLoading(false);
    audio.onended = () => setPlaying(false);
    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [audioUrl]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
  }

  function skip(secs: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.currentTime + secs, duration));
    if (!playing) audio.play();
  }

  function seekTo(sec: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = sec;
    if (!playing) audio.play();
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const bar = progressRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
    seekTo(ratio * duration);
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 pt-5 pb-4 space-y-4">

        {/* Progress bar + time */}
        <div className="space-y-1.5">
          <div
            ref={progressRef}
            onClick={handleProgressClick}
            className="relative h-1.5 bg-gray-100 rounded-full cursor-pointer group"
          >
            <div
              className="absolute inset-y-0 left-0 bg-gray-200 rounded-full"
              style={{ width: `${bufferedPct}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width]"
              style={{ width: `${progress}%`, backgroundColor: accent.bg }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${progress}%`, backgroundColor: accent.bg }}
            />
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-gray-400">
            <span>{formatTime(currentTime)}</span>
            <span>{duration > 0 ? formatTime(duration) : "--:--"}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6">
          {/* Rewind 30s — counter-clockwise arrow, tip points left */}
          <button
            onClick={() => skip(-30)}
            title="Rewind 30 seconds"
            className="flex flex-col items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: accent.text }}
          >
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
              <text x="12" y="16.5" fontSize="5" fontWeight="700" fill="currentColor" textAnchor="middle" fontFamily="system-ui, sans-serif">30</text>
            </svg>
            <span className="text-[10px] font-medium tracking-wide">rewind</span>
          </button>

          {/* Play / Pause */}
          <button
            onClick={toggle}
            title={playing ? "Pause" : "Play"}
            className="w-14 h-14 flex items-center justify-center rounded-full shadow-md text-white transition-all active:scale-95"
            style={{ backgroundColor: playing ? accent.bgHover : accent.bg }}
          >
            {loading ? (
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            ) : playing ? (
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <rect x="5" y="3" width="3.5" height="14" rx="1"/>
                <rect x="11.5" y="3" width="3.5" height="14" rx="1"/>
              </svg>
            ) : (
              <svg className="w-5 h-5 translate-x-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4.5 3.5l12 6.5-12 6.5V3.5z"/>
              </svg>
            )}
          </button>

          {/* Skip 30s — clockwise arrow, tip points right */}
          <button
            onClick={() => skip(30)}
            title="Skip 30 seconds"
            className="flex flex-col items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: accent.text }}
          >
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
              <text x="12" y="16.5" fontSize="5" fontWeight="700" fill="currentColor" textAnchor="middle" fontFamily="system-ui, sans-serif">30</text>
            </svg>
            <span className="text-[10px] font-medium tracking-wide">skip</span>
          </button>
        </div>
      </div>

      {/* Chapter list */}
      {chapters.length > 0 && (
        <div className="border-t border-gray-100">
          <div className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            Chapters
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
            {chapters.map((ch, i) => (
              <button
                key={i}
                onClick={() => seekTo(ch.startTime)}
                className="w-full text-left flex items-center gap-3 px-5 py-2.5 text-sm transition-colors"
                style={
                  i === activeIndex
                    ? { backgroundColor: accent.light, borderLeft: `3px solid ${accent.bg}`, color: accent.active }
                    : { borderLeft: "3px solid transparent", color: "#4b5563" }
                }
              >
                <span className="shrink-0 font-mono text-xs w-10 text-right" style={{ color: i === activeIndex ? accent.text : "#9ca3af" }}>
                  {formatTime(ch.startTime)}
                </span>
                <span className={i === activeIndex ? "font-medium" : ""}>{ch.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
