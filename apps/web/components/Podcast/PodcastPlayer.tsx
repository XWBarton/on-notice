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
  const [currentTime, setCurrentTime] = useState(0);
  const activeIndex = chapters.reduce((best, ch, i) => {
    return ch.startTime <= currentTime ? i : best;
  }, 0);

  function seekTo(sec: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = sec;
    audio.play();
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <audio
        ref={audioRef}
        controls
        className="w-full"
        src={audioUrl}
        preload="metadata"
        onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
      />

      {chapters.length > 0 && (
        <div className="space-y-0.5">
          {chapters.map((ch, i) => (
            <button
              key={i}
              onClick={() => seekTo(ch.startTime)}
              className={`w-full text-left flex items-baseline gap-3 px-2 py-1.5 rounded text-sm transition-colors ${
                i === activeIndex
                  ? "bg-blue-50 text-blue-800"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="shrink-0 font-mono text-xs text-gray-400 w-10 text-right">
                {formatTime(ch.startTime)}
              </span>
              <span className={i === activeIndex ? "font-medium" : ""}>{ch.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
