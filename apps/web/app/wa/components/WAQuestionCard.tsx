"use client";

import { useRef, useState } from "react";

interface WAQuestionCardProps {
  question: {
    question_number: number;
    subject: string | null;
    question_text: string | null;
    answer_text: string | null;
    ai_summary: string | null;
    minister_name: string | null;
    audio_clip_url: string | null;
    asker: {
      name_display: string;
      party_id: string | null;
      parties: { short_name: string; colour_hex: string } | null;
    } | null;
    minister: {
      name_display: string;
      parties: { short_name: string; colour_hex: string } | null;
    } | null;
  };
}

function PartyBadge({ short_name, colour_hex }: { short_name: string; colour_hex: string }) {
  return (
    <span
      className="text-xs font-semibold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: `${colour_hex}20`, color: colour_hex }}
    >
      {short_name}
    </span>
  );
}

function TranscriptBlock({ label, text }: { label: string; text: string }) {
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

function AudioClipPlayer({ url }: { url: string }) {
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
        {playing ? "Pause" : "Play Q&A"}
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

function CopyLinkButton({
  anchorId,
  asker,
  minister,
  subject,
}: {
  anchorId: string;
  asker: string | null;
  minister: string | null;
  subject: string | null;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const { origin, pathname, search } = window.location;
    const url = `${origin}${pathname}${search}#${anchorId}`;

    // Build a readable snippet: "Asker → Minister on Topic", falling back
    // gracefully when any part is missing.
    const people = [asker, minister].filter(Boolean).join(" → ");
    const headline = [people, subject].filter(Boolean).join(people && subject ? " — " : "");
    const text = headline ? `${headline}\n${url}` : url;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={copy}
      title="Copy a link to this question"
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

export function WAQuestionCard({ question }: WAQuestionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const party = question.asker?.parties;
  const hasTranscript = !!(question.question_text || question.answer_text);

  return (
    <div id={`q-${question.question_number}`} className="bg-white border border-gray-200 rounded-lg p-4 scroll-mt-20 target:ring-2 target:ring-[#FFD200] target:border-[#FFD200]">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-sm mb-1">
            <span className="text-xs font-medium text-gray-400">Q{question.question_number}</span>
            {party && <PartyBadge short_name={party.short_name} colour_hex={party.colour_hex} />}
            <span className="font-medium text-gray-800">
              {question.asker?.name_display ?? "Unknown"}
            </span>
            {(question.minister || question.minister_name) && (
              <>
                <span className="text-gray-400">→</span>
                {question.minister ? (
                  <>
                    {question.minister.parties && (
                      <PartyBadge
                        short_name={question.minister.parties.short_name}
                        colour_hex={question.minister.parties.colour_hex}
                      />
                    )}
                    <span className="text-gray-600">{question.minister.name_display}</span>
                  </>
                ) : (
                  <span className="text-gray-600">{question.minister_name}</span>
                )}
              </>
            )}
          </div>

          {question.minister && question.minister_name && (
            <p className="text-xs text-gray-400 mb-1">Asked of {question.minister_name}</p>
          )}

          {question.subject && (
            <p className="font-medium text-gray-900 text-sm">{question.subject}</p>
          )}
        </div>

        {question.audio_clip_url && (
          <div className="shrink-0">
            <AudioClipPlayer url={question.audio_clip_url} />
          </div>
        )}
      </div>

      {question.ai_summary && (
        <div className="mt-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">AI Summary</p>
          <p className="text-sm text-gray-500 leading-relaxed">{question.ai_summary}</p>
        </div>
      )}

      {expanded && hasTranscript && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-3">
          {question.question_text && (
            <TranscriptBlock label="Question" text={question.question_text} />
          )}
          {question.answer_text && (
            <TranscriptBlock label="Response" text={question.answer_text} />
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-4">
        {hasTranscript && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
          >
            {expanded ? "Hide transcript" : "Show quoted question & response"}
          </button>
        )}
        <CopyLinkButton
          anchorId={`q-${question.question_number}`}
          asker={question.asker?.name_display ?? null}
          minister={question.minister?.name_display ?? question.minister_name}
          subject={question.subject}
        />
      </div>
    </div>
  );
}
