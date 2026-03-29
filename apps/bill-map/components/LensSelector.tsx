"use client";
import type { Lens } from "@/lib/types";

const LENSES: { id: Lens; label: string }[] = [
  { id: "topic",     label: "Topic" },
  { id: "portfolio", label: "Portfolio" },
  { id: "house",     label: "House" },
  { id: "status",    label: "Status" },
];

interface Props {
  value: Lens;
  onChange: (lens: Lens) => void;
}

export default function LensSelector({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400 mr-1">Group by</span>
      {LENSES.map(lens => (
        <button
          key={lens.id}
          onClick={() => onChange(lens.id)}
          className={`px-2.5 py-1 text-xs rounded transition-colors ${
            value === lens.id
              ? "bg-gray-900 text-white"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          {lens.label}
        </button>
      ))}
    </div>
  );
}
