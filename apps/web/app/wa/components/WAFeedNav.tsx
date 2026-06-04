"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

type Chamber = "wa_la" | "wa_lc";

interface WAFeedNavProps {
  currentDate: string;
  currentChamber: Chamber;
  availableDates: string[];
}

const CHAMBERS: { id: Chamber; label: string; param: string }[] = [
  { id: "wa_la", label: "Legislative Assembly", param: "" },
  { id: "wa_lc", label: "Legislative Council", param: "?chamber=lc" },
];

export function WAFeedNav({ currentDate, currentChamber, availableDates }: WAFeedNavProps) {
  const router = useRouter();
  const chamberQuery = currentChamber === "wa_lc" ? "?chamber=lc" : "";

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-6">
      {/* Chamber toggle */}
      <div className="flex gap-2">
        {CHAMBERS.map((c) => {
          const isActive = currentChamber === c.id;
          return (
            <Link
              key={c.id}
              href={`/${currentDate}${c.param}`}
              prefetch
              className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${
                isActive
                  ? "bg-gray-900 text-white border-gray-900"
                  : "text-gray-600 border-gray-300 hover:border-gray-500"
              }`}
            >
              {c.label}
            </Link>
          );
        })}
      </div>

      {/* Date picker */}
      {availableDates.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Date:</label>
          <select
            value={currentDate}
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
  );
}
