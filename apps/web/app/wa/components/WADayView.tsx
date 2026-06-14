"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WAQuestionCard } from "./WAQuestionCard";
import { SessionPlayer } from "./SessionPlayer";
import { WADigestCard } from "./WADigestCard";

type Chamber = "wa_la" | "wa_lc";

export interface ChamberData {
  sittingDay: {
    id: string;
    audio_url: string | null;
    audio_duration_sec: number | null;
  } | null;
  questions: Array<{
    question_number: number;
    subject: string | null;
    question_text: string | null;
    answer_text: string | null;
    ai_summary: string | null;
    minister_name: string | null;
    audio_clip_url: string | null;
    is_dorothy_dixer: boolean;
    asker: { name_display: string; party_id: string | null; parties: { short_name: string; colour_hex: string } | null } | null;
    minister: { name_display: string; parties: { short_name: string; colour_hex: string } | null } | null;
  }>;
  digest: { lede: string | null; ai_summary: string | null } | null;
}

interface WADayViewProps {
  date: string;
  dateLabel: string;
  initialChamber: Chamber;
  chambers: Record<Chamber, ChamberData>;
  availableDates: string[];
}

// Seat leather colours of the WA Parliament chambers — unusually for a
// Westminster parliament, the Assembly is blue (not green); the Council is red.
const CHAMBERS: { id: Chamber; label: string; colour: string; icon: string }[] = [
  { id: "wa_la", label: "Legislative Assembly", colour: "#2D5D8E", icon: "/wa/icon-la.svg" },
  { id: "wa_lc", label: "Legislative Council", colour: "#9D2235", icon: "/wa/icon-lc.svg" },
];

export function WADayView({ date, dateLabel, initialChamber, chambers, availableDates }: WADayViewProps) {
  const router = useRouter();
  const [chamber, setChamber] = useState<Chamber>(initialChamber);
  const [showDixers, setShowDixers] = useState(false);
  const [partyFilter, setPartyFilter] = useState<string | null>(null);
  const chamberQuery = chamber === "wa_lc" ? "?chamber=lc" : "";
  const chamberLabel = CHAMBERS.find((c) => c.id === chamber)!.label;
  const data = chambers[chamber];

  const realQuestions = data.questions.filter((q) => !q.is_dorothy_dixer);
  const dixers = data.questions.filter((q) => q.is_dorothy_dixer);
  const baseQuestions = showDixers ? data.questions : realQuestions;

  // Distinct asker parties among the base questions, in first-seen order
  const parties: { short_name: string; colour_hex: string }[] = [];
  const seen = new Set<string>();
  for (const q of baseQuestions) {
    const p = q.asker?.parties;
    if (p && !seen.has(p.short_name)) {
      seen.add(p.short_name);
      parties.push(p);
    }
  }

  // Drop a stale filter if the selected party is no longer present (e.g. after
  // hiding dixers or switching chamber)
  const activeFilter = partyFilter && seen.has(partyFilter) ? partyFilter : null;
  const visibleQuestions = activeFilter
    ? baseQuestions.filter((q) => q.asker?.parties?.short_name === activeFilter)
    : baseQuestions;

  // Deep link to a question (#q-N): reveal it if it's a hidden Dorothy Dixer,
  // then scroll it into view. Client-rendered content means native hash
  // scrolling can fire before the card exists, so we do it ourselves.
  useEffect(() => {
    const match = window.location.hash.match(/^#q-(\d+)$/);
    if (!match) return;
    const n = Number(match[1]);
    if (data.questions.some((q) => q.question_number === n && q.is_dorothy_dixer)) {
      setShowDixers(true);
    }
    const id = requestAnimationFrame(() => {
      document.getElementById(`q-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
    // Keyed to chamber so a link followed after a chamber toggle still lands;
    // intentionally not re-running on showDixers/other state to avoid re-scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamber]);

  const switchChamber = (next: Chamber) => {
    setChamber(next);
    window.history.replaceState(null, "", `/${date}${next === "wa_lc" ? "?chamber=lc" : ""}`);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-6">
        {/* Chamber toggle — both chambers are pre-loaded so switching is instant */}
        <div className="flex gap-2">
          {CHAMBERS.map((c) => {
            const isActive = chamber === c.id;
            return (
              <button
                key={c.id}
                onClick={() => switchChamber(c.id)}
                style={
                  isActive
                    ? { backgroundColor: c.colour, borderColor: c.colour, color: "#fff" }
                    : { borderColor: `${c.colour}66`, color: c.colour }
                }
                className="flex items-center gap-1.5 text-sm font-medium pl-2 pr-3 py-1.5 rounded-full border transition-colors cursor-pointer hover:opacity-85"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.icon}
                  alt=""
                  width={20}
                  height={20}
                  className={isActive ? "rounded-full bg-white/90" : ""}
                />
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Date picker */}
        {availableDates.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Date:</label>
            <select
              value={date}
              onChange={(e) => router.push(`/${e.target.value}${chamberQuery}`)}
              className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {new Date(d + "T00:00:00").toLocaleDateString("en-AU", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div>
          <p className="text-sm text-gray-400 mb-1">{dateLabel}</p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Question Time
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {chamberLabel} · {realQuestions.length} questions
            {dixers.length > 0 ? ` · ${dixers.length} Dorothy Dixer${dixers.length !== 1 ? "s" : ""} hidden` : ""}
          </p>
          <a
            href={`/${date}/statements${chamberQuery}`}
            className="inline-block text-sm font-medium text-blue-600 hover:underline mt-1 mb-3"
          >
            View statements →
          </a>
          {data.sittingDay?.audio_url && (
            <SessionPlayer
              key={chamber}
              url={data.sittingDay.audio_url}
              durationSec={data.sittingDay.audio_duration_sec}
            />
          )}
        </div>

        {data.digest && <WADigestCard digest={data.digest} />}

        {data.questions.length > 0 ? (
          <div>
            {(parties.length > 1 || dixers.length > 0) && (
              <div className="flex items-center gap-2 justify-between mb-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {parties.length > 1 && (
                    <>
                      <button
                        onClick={() => setPartyFilter(null)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                          activeFilter === null
                            ? "bg-gray-800 text-white border-gray-800"
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        All
                      </button>
                      {parties.map((p) => {
                        const isActive = activeFilter === p.short_name;
                        return (
                          <button
                            key={p.short_name}
                            onClick={() => setPartyFilter(isActive ? null : p.short_name)}
                            className="text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors cursor-pointer"
                            style={
                              isActive
                                ? { backgroundColor: p.colour_hex, borderColor: p.colour_hex, color: "white" }
                                : { color: p.colour_hex, borderColor: `${p.colour_hex}66`, backgroundColor: "white" }
                            }
                          >
                            {p.short_name}
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
                {dixers.length > 0 && (
                  <button
                    onClick={() => setShowDixers((v) => !v)}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer shrink-0"
                  >
                    {showDixers
                      ? `Hide ${dixers.length} Dorothy Dixer${dixers.length !== 1 ? "s" : ""}`
                      : `Show ${dixers.length} Dorothy Dixer${dixers.length !== 1 ? "s" : ""}`}
                  </button>
                )}
              </div>
            )}
            <div className="space-y-3">
              {visibleQuestions.map((q) => (
                <div key={`${chamber}-${q.question_number}`} className={q.is_dorothy_dixer ? "opacity-60" : ""}>
                  {q.is_dorothy_dixer && (
                    <p className="text-xs text-gray-400 mb-1 ml-1">Dorothy Dixer</p>
                  )}
                  <WAQuestionCard question={q} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            No Question Time found for the {chamberLabel} on this sitting day. It may
            still be processing.
          </p>
        )}
      </div>
    </div>
  );
}
