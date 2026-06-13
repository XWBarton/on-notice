"use client";

import { useState } from "react";

type Member = {
  id: string;
  name_display: string;
  electorate: string | null;
  party_id: string | null;
  parties: { short_name: string; colour_hex: string | null } | null;
};

interface WASeatMapProps {
  laMembers: Member[];
  lcMembers: Member[];
}

type Chamber = "wa_la" | "wa_lc";

const FALLBACK_COLOUR = "#9E9E9E";

// Political position by party_id, left → right (government Labor on the left,
// crossbench in the middle, the Liberal/National opposition on the right).
const PARTY_POSITION: Record<string, number> = {
  wa_alp: 0,
  wa_grn: 3,
  wa_ajp: 3.5,
  wa_lcwa: 4,
  wa_ind: 4.5,
  wa_ac: 6,
  wa_onp: 7,
  wa_lib: 9,
  wa_nat: 10,
};

// Hemicycle geometry (shared with the federal seat map).
const ARC_START = Math.PI * 0.055;
const ARC_END = Math.PI * 0.945;
const CX = 360;
const CY = 440;

// seats per row ∝ radius, fixed up so the rows sum to the exact total.
function buildRows(radii: number[], total: number): [number, number][] {
  const radiiSum = radii.reduce((s, r) => s + r, 0);
  const raw = radii.map((r) => (r / radiiSum) * total);
  const rounded = raw.map(Math.round);
  const diff = total - rounded.reduce((s, n) => s + n, 0);
  const fracs = raw.map((v, i) => ({ i, frac: v - Math.floor(v) }));
  fracs.sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < Math.abs(diff); k++) rounded[fracs[k].i] += Math.sign(diff);
  return radii.map((r, i) => [r, rounded[i]]);
}

const RADII_LA = [165, 220, 275];
const RADII_LC = [170, 230, 290];

function computePositions(rows: [number, number][]) {
  const positions: { x: number; y: number; t: number }[] = [];
  for (const [radius, count] of rows) {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const angle = ARC_END - t * (ARC_END - ARC_START);
      positions.push({ x: CX + radius * Math.cos(angle), y: CY - radius * Math.sin(angle), t });
    }
  }
  positions.sort((a, b) => a.t - b.t);
  return positions;
}

function sortByParty(members: Member[]) {
  return [...members].sort((a, b) => {
    const pa = PARTY_POSITION[a.party_id ?? ""] ?? 5;
    const pb = PARTY_POSITION[b.party_id ?? ""] ?? 5;
    return pa - pb;
  });
}

function partyLegend(members: Member[]) {
  const seen = new Map<string, { short_name: string; colour: string; pos: number; count: number }>();
  for (const m of members) {
    const key = m.parties?.short_name ?? "?";
    if (!seen.has(key)) {
      seen.set(key, {
        short_name: key,
        colour: m.parties?.colour_hex ?? FALLBACK_COLOUR,
        pos: PARTY_POSITION[m.party_id ?? ""] ?? 5,
        count: 0,
      });
    }
    seen.get(key)!.count++;
  }
  return Array.from(seen.values()).sort((a, b) => b.count - a.count);
}

export function WASeatMap({ laMembers, lcMembers }: WASeatMapProps) {
  const [chamber, setChamber] = useState<Chamber>("wa_la");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const members = chamber === "wa_la" ? laMembers : lcMembers;
  const rows = chamber === "wa_la" ? buildRows(RADII_LA, laMembers.length) : buildRows(RADII_LC, lcMembers.length);

  const sorted = sortByParty(members);
  const positions = computePositions(rows);
  const legend = partyLegend(members);
  const hoveredMember = hoveredId ? members.find((m) => m.id === hoveredId) : null;

  const CHAMBERS: { id: Chamber; label: string; colour: string }[] = [
    { id: "wa_la", label: "Legislative Assembly", colour: "#2D5D8E" },
    { id: "wa_lc", label: "Legislative Council", colour: "#9D2235" },
  ];

  return (
    <div>
      {/* Chamber toggle */}
      <div className="flex gap-2 mb-6">
        {CHAMBERS.map((c) => (
          <button
            key={c.id}
            onClick={() => setChamber(c.id)}
            style={chamber === c.id ? { backgroundColor: c.colour } : undefined}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              chamber === c.id ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {members.length === 0 ? (
        <p className="text-gray-400 text-sm py-12 text-center">No member data available for this chamber.</p>
      ) : (
        <>
          {/* Seat map SVG */}
          <div className="relative">
            <svg viewBox="0 100 720 340" className="w-full" style={{ maxHeight: 380 }}>
              {sorted.map((member, i) => {
                const pos = positions[i];
                if (!pos) return null;
                const colour = member.parties?.colour_hex ?? FALLBACK_COLOUR;
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
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.colour }} />
                <span className="font-medium">{p.short_name}</span>
                <span className="text-gray-400">{p.count}</span>
              </div>
            ))}
          </div>

          <p className="text-sm text-gray-400 mt-3 text-center">{members.length} members</p>

          {/* Member list — grouped by party (in seating order) */}
          <div className="mt-8 space-y-6">
            {(() => {
              const groups: { short_name: string; colour: string; members: Member[] }[] = [];
              for (const member of sorted) {
                const key = member.parties?.short_name ?? "?";
                const existing = groups.find((g) => g.short_name === key);
                if (existing) existing.members.push(member);
                else groups.push({ short_name: key, colour: member.parties?.colour_hex ?? FALLBACK_COLOUR, members: [member] });
              }
              return groups.map((group) => (
                <div key={group.short_name}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.colour }} />
                    <span className="text-sm font-semibold text-gray-700">{group.short_name}</span>
                    <span className="text-xs text-gray-400">{group.members.length}</span>
                    <div className="flex-1 h-px bg-gray-100 ml-1" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1">
                    {[...group.members]
                      .sort((a, b) => a.name_display.localeCompare(b.name_display))
                      .map((member) => (
                        <div key={member.id} className="flex items-baseline gap-2 py-0.5">
                          <span className="text-sm text-gray-800 font-medium leading-snug">{member.name_display}</span>
                          {member.electorate && member.electorate !== "Western Australia" && (
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
