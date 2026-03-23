"use client";

import { useRouter } from "next/navigation";

interface FeedNavProps {
  currentDate: string;
  currentParliament: string;
  availableDates: string[];
}

export function FeedNav({ currentDate, currentParliament, availableDates }: FeedNavProps) {
  const router = useRouter();

  const chambers = [
    { id: "fed_hor", label: "House of Reps", activeClass: "bg-[#006945] text-white", hoverClass: "hover:bg-green-50 text-gray-600" },
    { id: "fed_sen", label: "Senate", activeClass: "bg-[#C1121F] text-white", hoverClass: "hover:bg-red-50 text-gray-600" },
  ];

  function navigate(date: string, parliament: string) {
    router.push(`/${date}?parliament=${parliament}`);
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-6">
      {/* Chamber toggle */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
        {chambers.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(currentDate, c.id)}
            className={`px-4 py-1.5 font-medium transition-colors ${
              currentParliament === c.id
                ? c.activeClass
                : `bg-white ${c.hoverClass}`
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-500">Date:</label>
        <select
          value={currentDate}
          onChange={(e) => navigate(e.target.value, currentParliament)}
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
    </div>
  );
}
