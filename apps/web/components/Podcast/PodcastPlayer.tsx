"use client";

import { useRef, useState, useEffect, useCallback } from "react";

export interface Chapter {
  startTime: number;
  title: string;
  url?: string;
}

interface PodcastPlayerProps {
  audioUrl: string;
  chapters: Chapter[];
}

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PodcastPlayer({ audioUrl, chapters }: PodcastPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [loading, setLoading] = useState(false);

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
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
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
    const ratio = (e.clientX - rect.left) / rect.width;
    seekTo(ratio * duration);
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Player controls */}
      <div className="px-5 py-4 space-y-3">
        {/* Progress bar */}
        <div
          ref={progressRef}
          onClick={handleProgressClick}
          className="relative h-2 bg-gray-100 rounded-full cursor-pointer group"
        >
          {/* Buffered */}
          <div
            className="absolute inset-y-0 left-0 bg-gray-200 rounded-full transition-all"
            style={{ width: `${bufferedPct}%` }}
          />
          {/* Played */}
          <div
            className="absolute inset-y-0 left-0 bg-blue-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-blue-500 rounded-full shadow -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `${progress}%` }}
          />
        </div>

        {/* Time labels */}
        <div className="flex items-center justify-between text-xs text-gray-400 font-mono -mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{duration > 0 ? formatTime(duration) : "--:--"}</span>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => skip(-30)}
            title="Rewind 30 seconds"
            className="flex flex-col items-center gap-0.5 text-gray-500 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.56" />
              <text x="7.5" y="14.5" fontSize="5.5" fontWeight="700" fill="currentColor" stroke="none" textAnchor="middle">30</text>
            </svg>
            <span className="text-[10px] font-medium">-30s</span>
          </button>

          <button
            onClick={toggle}
            title={playing ? "Pause" : "Play"}
            className="w-12 h-12 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-md transition-all active:scale-95"
          >
            {loading ? (
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : playing ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg className="w-5 h-5 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 3l14 9-14 9V3z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => skip(30)}
            title="Skip 30 seconds"
            className="flex flex-col items-center gap-0.5 text-gray-500 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6" />
              <path d="M20.49 15a9 9 0 1 1-.49-3.56" />
              <text x="12" y="14.5" fontSize="5.5" fontWeight="700" fill="currentColor" stroke="none" textAnchor="middle">30</text>
            </svg>
            <span className="text-[10px] font-medium">+30s</span>
          </button>
        </div>
      </div>

      {/* Chapter list */}
      {chapters.length > 0 && (
        <div className="border-t border-gray-100">
          <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Chapters
          </div>
          <div className="max-h-64 overflow-y-auto">
            {chapters.map((ch, i) => (
              <button
                key={i}
                onClick={() => seekTo(ch.startTime)}
                className={`w-full text-left flex items-baseline gap-3 px-4 py-2 text-sm transition-colors ${
                  i === activeIndex
                    ? "bg-blue-50 text-blue-800 border-l-2 border-blue-500"
                    : "text-gray-600 hover:bg-gray-50 border-l-2 border-transparent"
                }`}
              >
                <span className="shrink-0 font-mono text-xs text-gray-400 w-10 text-right">
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
