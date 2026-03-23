"use client";

import { useState } from "react";

type Member = {
  id: string;
  name_display: string;
  electorate: string | null;
  role: string | null;
  party_id: string | null;
  parties: { name: string; short_name: string; colour_hex: string | null } | null;
};

interface SeatMapProps {
  horMembers: Member[];
  senMembers: Member[];
}

// Normalize raw party short_names from DB to display values
const PARTY_NORMALIZE: Record<string, { short_name: string; colour: string }> = {
  ALP: { short_name: "ALP", colour: "#D34547" },
  LIB: { short_name: "LIB", colour: "#2A4E97" },
  LIBERA: { short_name: "LIB", colour: "#2A4E97" },
  LNP: { short_name: "LNP", colour: "#244B77" },
  NAT: { short_name: "NAT", colour: "#406D50" },
  NATION: { short_name: "NAT", colour: "#406D50" },
  GRN: { short_name: "GRN", colour: "#3B874A" },
  ON:  { short_name: "ON",  colour: "#E1733C" },
  PAULIN: { short_name: "ON", colour: "#E1733C" },
  TEAL: { short_name: "TEAL", colour: "#4B9FB4" },
  IND: { short_name: "IND", colour: "#757575" },
  KAP: { short_name: "KAP", colour: "#795548" },
  UAP: { short_name: "UAP", colour: "#FDD835" },
  CA:  { short_name: "CA",  colour: "#4B9FB4" },
  SPEAKE: { short_name: "SPK", colour: "#9E9E9E" },
  SPK: { short_name: "SPK", colour: "#9E9E9E" },
};

function normalizeParty(raw: string | null | undefined): { short_name: string; colour: string } {
  if (!raw) return { short_name: "?", colour: "#9E9E9E" };
  return PARTY_NORMALIZE[raw] ?? { short_name: raw, colour: "#9E9E9E" };
}

// Political position by party_id: 0 = government right, 10 = opposition left
const PARTY_POSITION: Record<string, number> = {
  alp: 0,
  grn: 5,
  cli200: 5.5,
  ind: 6,
  kap: 6.5,
  uap: 7,
  on: 7.5,
  phon: 7.5,
  lnp: 8,
  nat: 9,
  lib: 10,
};

// Rows: [radius, seatCount] — total must match chamber size
const ROWS_HOR: [number, number][] = [
  [155, 22],
  [197, 28],
  [239, 34],
  [281, 40],
  [323, 27],
]; // total: 151

const ROWS_SEN: [number, number][] = [
  [155, 16],
  [197, 20],
  [239, 24],
  [281, 16],
]; // total: 76

// Arc from ~11° to ~169° (slight margin from horizontal)
const ARC_START = Math.PI * 0.06;
const ARC_END = Math.PI * 0.94;

// SVG coordinate origin for arc center (bottom center, off-canvas)
const CX = 360;
const CY = 440;

function computePositions(rows: [number, number][]) {
  const positions: { x: number; y: number }[] = [];
  for (const [radius, count] of rows) {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const angle = ARC_START + t * (ARC_END - ARC_START);
      positions.push({
        x: CX + radius * Math.cos(angle),
        y: CY - radius * Math.sin(angle),
      });
    }
  }
  return positions;
}

function sortByParty(members: Member[]) {
  return [...members].sort((a, b) => {
    const pa = PARTY_POSITION[a.party_id ?? ""] ?? 6;
    const pb = PARTY_POSITION[b.party_id ?? ""] ?? 6;
    return pa - pb;
  });
}

function partyLegend(members: Member[]) {
  const seen = new Map<string, { short_name: string; colour: string; count: number }>();
  for (const m of members) {
    if (!m.party_id) continue;
    const norm = normalizeParty(m.parties?.short_name);
    if (!seen.has(norm.short_name)) {
      seen.set(norm.short_name, { ...norm, count: 0 });
    }
    seen.get(norm.short_name)!.count++;
  }
  return Array.from(seen.values()).sort((a, b) => b.count - a.count);
}

export function SeatMap({ horMembers, senMembers }: SeatMapProps) {
  const [chamber, setChamber] = useState<"fed_hor" | "fed_sen">("fed_hor");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const members = chamber === "fed_hor" ? horMembers : senMembers;
  const rows = chamber === "fed_hor" ? ROWS_HOR : ROWS_SEN;
  const sorted = sortByParty(members);
  const positions = computePositions(rows);
  const legend = partyLegend(members);
  const hoveredMember = hoveredId ? members.find((m) => m.id === hoveredId) : null;

  return (
    <div>
      {/* Chamber toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setChamber("fed_hor")}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            chamber === "fed_hor"
              ? "bg-[#006945] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          House of Representatives
        </button>
        <button
          onClick={() => setChamber("fed_sen")}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            chamber === "fed_sen"
              ? "bg-[#C1121F] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Senate
        </button>
      </div>

      {members.length === 0 ? (
        <p className="text-gray-400 text-sm py-12 text-center">No member data available for this chamber.</p>
      ) : (
        <>
          {/* Seat map SVG */}
          <div className="relative">
            <svg
              viewBox="0 100 720 340"
              className="w-full"
              style={{ maxHeight: 380 }}
            >
              {sorted.map((member, i) => {
                const pos = positions[i];
                if (!pos) return null;
                const { colour } = normalizeParty(member.parties?.short_name);
                const isHovered = hoveredId === member.id;
                return (
                  <circle
                    key={member.id}
                    cx={pos.x}
                    cy={pos.y}
                    r={isHovered ? 11 : 9}
                    fill={colour}
                    stroke={isHovered ? "#111" : "white"}
                    strokeWidth={isHovered ? 2 : 1}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredId(member.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  />
                );
              })}
            </svg>

            {/* Hover tooltip */}
            {hoveredMember && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded shadow-lg pointer-events-none whitespace-nowrap">
                <span className="font-semibold">{hoveredMember.name_display}</span>
                {hoveredMember.electorate && (
                  <span className="text-gray-300"> · {hoveredMember.electorate}</span>
                )}
                {hoveredMember.parties && (
                  <span className="text-gray-300"> · {hoveredMember.parties.short_name}</span>
                )}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4 justify-center">
            {legend.map((p) => (
              <div key={p.short_name} className="flex items-center gap-1.5 text-sm text-gray-600">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: p.colour }}
                />
                <span className="font-medium">{p.short_name}</span>
                <span className="text-gray-400">{p.count}</span>
              </div>
            ))}
          </div>

          <p className="text-sm text-gray-400 mt-3 text-center">{members.length} members</p>

          {/* Member list */}
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2">
            {sorted.map((member) => (
              <div key={member.id} className="flex items-center gap-1.5 text-sm py-1 border-b border-gray-100">
                {member.parties && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: member.parties.colour_hex ?? "#9E9E9E" }}
                  />
                )}
                <span className="text-gray-800 truncate">{member.name_display}</span>
                {member.electorate && (
                  <span className="text-gray-400 text-xs truncate hidden sm:block">{member.electorate}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
