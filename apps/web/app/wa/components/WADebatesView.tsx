"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WADebateCard, type WADebate } from "./WADebateCard";

type Chamber = "wa_la" | "wa_lc";

export interface DebateChamberData {
  debates: WADebate[];
}

interface WADebatesViewProps {
  date: string;
  dateLabel: string;
  initialChamber: Chamber;
  chambers: Record<Chamber, DebateChamberData>;
  availableDates: string[];
}

// Seat leather colours of the WA chambers — Assembly blue, Council red.
const CHAMBERS: { id: Chamber; label: string; colour: string; icon: string }[] = [
  { id: "wa_la", label: "Legislative Assembly", colour: "#2D5D8E", icon: "/wa/icon-la.svg" },
  { id: "wa_lc", label: "Legislative Council", colour: "#9D2235", icon: "/wa/icon-lc.svg" },
];

const TYPE_FILTERS: { id: string; label: string; colour: string }[] = [
  { id: "grievance", label: "Grievances", colour: "#9D2235" },
  { id: "ministerial_statement", label: "Ministerial", colour: "#2D5D8E" },
  { id: "member_statement", label: "Member", colour: "#6B7280" },
];

export function WADebatesView({ date, dateLabel, initialChamber, chambers, availableDates }: WADebatesViewProps) {
  const router = useRouter();
  const [chamber, setChamber] = useState<Chamber>(initialChamber);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const chamberQuery = chamber === "wa_lc" ? "?chamber=lc" : "";
  const chamberLabel = CHAMBERS.find((c) => c.id === chamber)!.label;
  const data = chambers[chamber];

  // Type filters present among this chamber's debates, preserving display order.
  const presentTypes = new Set(data.debates.map((d) => d.proceeding_type ?? ""));
  const filters = TYPE_FILTERS.filter((f) => presentTypes.has(f.id));
  const activeFilter = typeFilter && presentTypes.has(typeFilter) ? typeFilter : null;
  const visibleDebates = activeFilter
    ? data.debates.filter((d) => d.proceeding_type === activeFilter)
    : data.debates;

  // Deep link to a debate (#d-N): scroll it into view once rendered.
  useEffect(() => {
    const match = window.location.hash.match(/^#d-(\d+)$/);
    if (!match) return;
    const id = requestAnimationFrame(() => {
      document.getElementById(`d-${match[1]}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamber]);

  const switchChamber = (next: Chamber) => {
    setChamber(next);
    window.history.replaceState(null, "", `/${date}/statements${next === "wa_lc" ? "?chamber=lc" : ""}`);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-6">
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

        {availableDates.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Date:</label>
            <select
              value={date}
              onChange={(e) => router.push(`/${e.target.value}/statements${chamberQuery}`)}
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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Statements</h1>
          <p className="text-sm text-gray-500 mt-1">
            {chamberLabel} · {data.debates.length} item{data.debates.length !== 1 ? "s" : ""}
          </p>
          <a
            href={`/${date}${chamberQuery}`}
            className="inline-block text-sm font-medium text-blue-600 hover:underline mt-1"
          >
            ← Question Time
          </a>
        </div>

        {data.debates.length > 0 ? (
          <div>
            {filters.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap mb-3">
                <button
                  onClick={() => setTypeFilter(null)}
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                    activeFilter === null
                      ? "bg-gray-800 text-white border-gray-800"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  All
                </button>
                {filters.map((f) => {
                  const isActive = activeFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setTypeFilter(isActive ? null : f.id)}
                      className="text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors cursor-pointer"
                      style={
                        isActive
                          ? { backgroundColor: f.colour, borderColor: f.colour, color: "white" }
                          : { color: f.colour, borderColor: `${f.colour}66`, backgroundColor: "white" }
                      }
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="space-y-3">
              {visibleDebates.map((d) => (
                <WADebateCard key={`${chamber}-${d.hansard_section}`} debate={d} />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            No statements found for the {chamberLabel} on this sitting day. They may still
            be processing.
          </p>
        )}
      </div>
    </div>
  );
}
