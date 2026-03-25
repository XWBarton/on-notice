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
  LNP: { short_name: "L/NP", colour: "#244B77" },
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
  AV:  { short_name: "AV",  colour: "#7B61B2" },
  AUSTRA: { short_name: "AV", colour: "#7B61B2" },
  JACQUI: { short_name: "JLN", colour: "#E07B39" },
  COUNTR: { short_name: "CLP", colour: "#B07D3A" },
  SPEAKE: { short_name: "SPK", colour: "#9E9E9E" },
  SPK:    { short_name: "SPK", colour: "#9E9E9E" },
  PRESID: { short_name: "PRES", colour: "#9E9E9E" },
  DEPUTY: { short_name: "DEP",  colour: "#BDBDBD" },
};

function normalizeParty(raw: string | null | undefined): { short_name: string; colour: string } {
  if (!raw) return { short_name: "?", colour: "#9E9E9E" };
  return PARTY_NORMALIZE[raw] ?? { short_name: raw, colour: "#9E9E9E" };
}

// Political position by party_id: 0 = ALP (left/gallery-left), 10 = LIB (right/gallery-right)
const PARTY_POSITION: Record<string, number> = {
  alp: 0,
  grn: 5,
  av: 5.3,
  cli200: 5.5,
  ind: 6,
  ca: 6.3,
  kap: 6.5,
  uap: 7,
  on: 7.5,
  phon: 7.5,
  jln: 6.2,
  lnp: 8,
  nat: 9,
  clp: 9.5,
  lib: 10,
  deputy: 5.8,  // Deputy President — crossbench
  presid: 6,    // fallback if not filtered as presiding officer
};

// Arc from ~10° to ~170° (hemicycle with small margin from horizontal)
const ARC_START = Math.PI * 0.055;
const ARC_END = Math.PI * 0.945;

// SVG coordinate origin for arc center (bottom center)
const CX = 360;
const CY = 440;

// Compute proportional seat counts for a hemicycle so angular spacing is
// consistent across rows. seats_i ∝ radius_i, adjusted to hit total exactly.
function buildRows(radii: number[], total: number): [number, number][] {
  const radiiSum = radii.reduce((s, r) => s + r, 0);
  const raw = radii.map((r) => (r / radiiSum) * total);
  // Round, then fix rounding error on the largest row
  const rounded = raw.map(Math.round);
  const diff = total - rounded.reduce((s, n) => s + n, 0);
  // Apply remainder to the row with the largest fractional part
  const fracs = raw.map((v, i) => ({ i, frac: v - Math.floor(v) }));
  fracs.sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < Math.abs(diff); k++) {
    rounded[fracs[k].i] += Math.sign(diff);
  }
  return radii.map((r, i) => [r, rounded[i]]);
}

const RADII_HOR = [150, 192, 234, 276, 318];
const RADII_SEN = [150, 192, 234, 276];

const ROWS_HOR = buildRows(RADII_HOR, 151);
const ROWS_SEN = buildRows(RADII_SEN, 76);

function computePositions(rows: [number, number][]) {
  const positions: { x: number; y: number; t: number }[] = [];
  for (const [radius, count] of rows) {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      // t=0 → ARC_END (left side), t=1 → ARC_START (right side)
      // so ALP (position 0) sits on the left, LIB (10) on the right — matching gallery view
      const angle = ARC_END - t * (ARC_END - ARC_START);
      positions.push({
        x: CX + radius * Math.cos(angle),
        y: CY - radius * Math.sin(angle),
        t,
      });
    }
  }
  // Sort by t so each party occupies a clean angular sector
  positions.sort((a, b) => a.t - b.t);
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

function isPresidingOfficer(m: Member) {
  const norm = normalizeParty(m.parties?.short_name).short_name;
  if (norm === "SPK" || norm === "PRES") return true;
  const role = (m.role ?? "").toLowerCase();
  return role.includes("speaker") || role.includes("president of the senate");
}

export function SeatMap({ horMembers, senMembers }: SeatMapProps) {
  const [chamber, setChamber] = useState<"fed_hor" | "fed_sen">("fed_hor");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const members = chamber === "fed_hor" ? horMembers : senMembers;
  const rows = chamber === "fed_hor" ? ROWS_HOR : ROWS_SEN;

  const presiding = members.find(isPresidingOfficer) ?? null;
  const regularMembers = presiding ? members.filter((m) => m.id !== presiding.id) : members;

  const sorted = sortByParty(regularMembers);
  const positions = computePositions(rows);
  const legend = partyLegend(members);
  const hoveredMember = hoveredId ? members.find((m) => m.id === hoveredId) : null;

  // Speaker/President sits at the focal point of the arc, bottom centre
  const SPEAKER_X = CX;
  const SPEAKER_Y = CY - 62;

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
              {/* Speaker / President of the Senate — centre focal point */}
              {presiding && (() => {
                const isHovered = hoveredId === presiding.id;
                const label = chamber === "fed_sen" ? "PRES" : "SPK";
                return (
                  <g
                    key={presiding.id}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredId(presiding.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <rect
                      x={SPEAKER_X - 16}
                      y={SPEAKER_Y - 12}
                      width={32}
                      height={24}
                      rx={4}
                      fill={isHovered ? "#555" : "#9E9E9E"}
                      stroke={isHovered ? "#111" : "white"}
                      strokeWidth={isHovered ? 2 : 1}
                    />
                    <text
                      x={SPEAKER_X}
                      y={SPEAKER_Y + 4}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight="bold"
                      fill="white"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {label}
                    </text>
                  </g>
                );
              })()}

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

          {/* Member list — grouped by party */}
          <div className="mt-8 space-y-6">
            {(() => {
              // Group sorted members by normalised party short_name
              const groups: { short_name: string; colour: string; members: Member[] }[] = [];
              for (const member of sorted) {
                const norm = normalizeParty(member.parties?.short_name);
                const existing = groups.find((g) => g.short_name === norm.short_name);
                if (existing) {
                  existing.members.push(member);
                } else {
                  groups.push({ short_name: norm.short_name, colour: norm.colour, members: [member] });
                }
              }
              return groups.map((group) => (
                <div key={group.short_name}>
                  {/* Party header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="inline-block w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: group.colour }}
                    />
                    <span className="text-sm font-semibold text-gray-700">{group.short_name}</span>
                    <span className="text-xs text-gray-400">{group.members.length}</span>
                    <div className="flex-1 h-px bg-gray-100 ml-1" />
                  </div>
                  {/* Members grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1">
                    {group.members.map((member) => (
                      <div key={member.id} className="flex items-baseline gap-2 py-0.5">
                        <span className="text-sm text-gray-800 font-medium leading-snug">{member.name_display}</span>
                        {member.electorate && (
                          <span className="text-xs text-gray-400 shrink-0">{member.electorate}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        </>
      )}
    </div>
  );
}
