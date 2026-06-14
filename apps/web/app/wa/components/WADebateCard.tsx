"use client";

import { useState } from "react";
import { PartyBadge, TranscriptBlock, AudioClipPlayer, CopyLinkButton } from "./cardBits";

export interface DebateSpeech {
  speaker: string;
  member_id: string | null;
  party_short: string | null;
  party_colour: string | null;
  text: string;
}

export interface WADebate {
  hansard_section: number;
  proceeding_type: string | null;
  title: string | null;
  ai_summary: string | null;
  transcript_json: DebateSpeech[] | null;
  audio_clip_url: string | null;
}

const TYPE_META: Record<string, { label: string; colour: string }> = {
  grievance: { label: "Grievance", colour: "#9D2235" },
  ministerial_statement: { label: "Ministerial Statement", colour: "#2D5D8E" },
  member_statement: { label: "Member Statement", colour: "#6B7280" },
};

function TypeBadge({ type }: { type: string | null }) {
  const meta = (type && TYPE_META[type]) || { label: type ?? "Debate", colour: "#6B7280" };
  return (
    <span
      className="text-xs font-semibold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: `${meta.colour}20`, color: meta.colour }}
    >
      {meta.label}
    </span>
  );
}

export function WADebateCard({ debate }: { debate: WADebate }) {
  const [expanded, setExpanded] = useState(false);
  const speeches = debate.transcript_json ?? [];

  // Distinct speakers (in first-seen order) for the header.
  const speakers: DebateSpeech[] = [];
  const seen = new Set<string>();
  for (const s of speeches) {
    if (!seen.has(s.speaker)) {
      seen.add(s.speaker);
      speakers.push(s);
    }
  }

  const hasTranscript = speeches.length > 0;

  return (
    <div
      id={`d-${debate.hansard_section}`}
      className="bg-white border border-gray-200 rounded-lg p-4 scroll-mt-20 target:ring-2 target:ring-[#FFD200] target:border-[#FFD200]"
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-sm mb-1">
            <TypeBadge type={debate.proceeding_type} />
            {speakers.map((s, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {s.party_short && s.party_colour && (
                  <PartyBadge short_name={s.party_short} colour_hex={s.party_colour} />
                )}
                <span className="font-medium text-gray-800">{s.speaker}</span>
              </span>
            ))}
          </div>

          {debate.title && (
            <p className="font-medium text-gray-900 text-sm">{debate.title}</p>
          )}
        </div>

        {debate.audio_clip_url && (
          <div className="shrink-0">
            <AudioClipPlayer url={debate.audio_clip_url} label="Play" />
          </div>
        )}
      </div>

      {debate.ai_summary && (
        <div className="mt-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">AI Summary</p>
          <p className="text-sm text-gray-500 leading-relaxed">{debate.ai_summary}</p>
        </div>
      )}

      {expanded && hasTranscript && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-3">
          {speeches.map((s, i) => (
            <TranscriptBlock key={i} label={s.speaker} text={s.text} />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-4">
        {hasTranscript && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
          >
            {expanded ? "Hide transcript" : "Show transcript"}
          </button>
        )}
        <CopyLinkButton
          anchorId={`d-${debate.hansard_section}`}
          snippet={[speakers[0]?.speaker, debate.title].filter(Boolean).join(speakers[0] && debate.title ? " — " : "") || null}
        />
      </div>
    </div>
  );
}
