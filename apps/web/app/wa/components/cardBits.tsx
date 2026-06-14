"use client";

import { useRef, useState } from "react";

export function PartyBadge({ short_name, colour_hex }: { short_name: string; colour_hex: string }) {
  return (
    <span
      className="text-xs font-semibold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: `${colour_hex}20`, color: colour_hex }}
    >
      {short_name}
    </span>
  );
}

export function TranscriptBlock({ label, text }: { label: string; text: string }) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <p key={i} className="text-sm text-gray-600 leading-relaxed">{line}</p>
        ))}
      </div>
    </div>
  );
}

export function AudioClipPlayer({ url, label = "Play" }: { url: string; label?: string }) {
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

  function restart() {
    const a = getAudio();
    a.currentTime = 0;
    a.play();
    setPlaying(true);
  }

  function skip30() {
    const a = getAudio();
    a.currentTime = Math.min(a.currentTime + 30, a.duration || a.currentTime + 30);
    if (!playing) {
      a.play();
      setPlaying(true);
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={toggle}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-full px-3 py-1 transition-colors"
      >
        {playing ? (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2" y="1" width="3" height="10" rx="0.5" />
            <rect x="7" y="1" width="3" height="10" rx="0.5" />
          </svg>
        ) : (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
            <path d="M3 2l7 4-7 4V2z" />
          </svg>
        )}
        {playing ? "Pause" : label}
      </button>
      {started && (
        <>
          <button
            onClick={restart}
            title="Restart"
            className="inline-flex items-center justify-center w-6 h-6 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-full transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8a5 5 0 1 0 1.5-3.5" />
              <polyline points="1,4 3,8 7,6" />
            </svg>
          </button>
          <button
            onClick={skip30}
            title="Skip 30s forward"
            className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-full px-2 py-1 transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
              <path d="M9 6L5 3v6l4-3z" />
              <rect x="9" y="3" width="1.5" height="6" rx="0.5" />
            </svg>
            <span>30</span>
          </button>
        </>
      )}
    </div>
  );
}

export function CopyLinkButton({ anchorId, snippet }: { anchorId: string; snippet: string | null }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const { origin, pathname, search } = window.location;
    const url = `${origin}${pathname}${search}#${anchorId}`;
    const text = snippet ? `${snippet}\n${url}` : url;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={copy}
      title="Copy a link to this item"
      className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3,8 7,12 13,4" />
          </svg>
          Link copied
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 9.5a2.5 2.5 0 0 0 3.6.1l2.4-2.4a2.5 2.5 0 0 0-3.5-3.5l-1.4 1.3" />
            <path d="M9.5 6.5a2.5 2.5 0 0 0-3.6-.1L3.5 8.8a2.5 2.5 0 0 0 3.5 3.5l1.4-1.3" />
          </svg>
          Copy link
        </>
      )}
    </button>
  );
}
