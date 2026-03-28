"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useBrainrot } from "@/context/BrainrotContext";

interface FeedNavProps {
  currentDate: string;
  currentParliament: string;
  availableDates: string[];
}

export function FeedNav({ currentDate, currentParliament, availableDates }: FeedNavProps) {
  const router = useRouter();
  const { unlocked, active, toggle } = useBrainrot();

  const chambers = [
    { id: "fed_hor", label: "House of Reps", activeClass: "bg-[#006945] text-white", hoverClass: "hover:bg-green-50 text-gray-600" },
    { id: "fed_sen", label: "Senate", activeClass: "bg-[#C1121F] text-white", hoverClass: "hover:bg-red-50 text-gray-600" },
  ];

  function navigate(date: string, parliament: string) {
    router.push(`/${date}?parliament=${parliament}`);
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-6">
      {/* Chamber toggle + brainrot toggle */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {chambers.map((c) => {
            const isActive = currentParliament === c.id;
            const cls = "px-4 py-1.5 font-medium transition-colors";
            if (isActive) {
              return (
                <span key={c.id} className={`${cls} ${c.activeClass}`}>
                  {c.label}
                </span>
              );
            }
            return (
              <Link
                key={c.id}
                href={`/${currentDate}?parliament=${c.id}`}
                prefetch={true}
                className={`${cls} bg-white ${c.hoverClass}`}
              >
                {c.label}
              </Link>
            );
          })}
        </div>

        {unlocked && (
          <button
            onClick={toggle}
            title="Toggle brainrot mode"
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
              active
                ? "bg-purple-500 text-white border-purple-600 hover:bg-purple-600"
                : "bg-white text-purple-500 border-purple-300 hover:bg-purple-50"
            }`}
          >
            {active ? "brainrot: on" : "brainrot: off"}
          </button>
        )}
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
