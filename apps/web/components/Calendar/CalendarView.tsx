"use client";

import { useState } from "react";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from "date-fns";

interface CalendarViewProps {
  dataMap: Record<string, string[]>;         // date → parliaments with complete data
  scheduledDates: Record<string, string[]>;  // date → parliaments scheduled to sit
}

export function CalendarView({ dataMap, scheduledDates }: CalendarViewProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(today));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = (getDay(monthStart) + 6) % 7; // Monday = 0

  const monthKey = format(currentMonth, "yyyy-MM");
  const hasAnyData = Object.keys(dataMap).some((d) => d.startsWith(monthKey));
  const hasAnyScheduled = Object.keys(scheduledDates).some((d) => d.startsWith(monthKey));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sitting Calendar</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
            aria-label="Previous month"
          >
            ←
          </button>
          <span className="text-base font-semibold w-36 text-center">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <button
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors"
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>

      {!hasAnyData && !hasAnyScheduled && (
        <p className="text-gray-400 text-sm text-center py-8">No sitting days this month.</p>
      )}

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-xs text-gray-400 font-medium pb-1">{d}</div>
        ))}

        {Array.from({ length: startPad }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}

        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isWeekend = getDay(day) === 0 || getDay(day) === 6;
          const isToday = dateStr === format(today, "yyyy-MM-dd");
          const dataParls = dataMap[dateStr] ?? [];
          const scheduledParls = scheduledDates[dateStr] ?? [];

          const hasData = dataParls.length > 0;
          const isScheduled = scheduledParls.length > 0 && !hasData;
          const isPast = day < today && !hasData;

          const hasHor = dataParls.includes("fed_hor");
          const hasSen = dataParls.includes("fed_sen");
          const hasBoth = hasHor && hasSen;

          const scheduledHor = scheduledParls.includes("fed_hor");
          const scheduledSen = scheduledParls.includes("fed_sen");
          const scheduledBoth = scheduledHor && scheduledSen;

          if (hasData) {
            return (
              <a
                key={dateStr}
                href={`/${dateStr}`}
                className="aspect-square flex flex-col items-center justify-center rounded-lg hover:opacity-80 transition-opacity"
                style={{
                  background: hasBoth
                    ? "linear-gradient(135deg, #006945 50%, #C1121F 50%)"
                    : hasHor ? "#006945" : "#C1121F",
                }}
                title={`${format(day, "d MMMM yyyy")} — ${hasBoth ? "House & Senate" : hasHor ? "House of Representatives" : "Senate"}`}
              >
                <span className="text-sm font-semibold text-white">{format(day, "d")}</span>
              </a>
            );
          }

          if (isScheduled) {
            return (
              <div
                key={dateStr}
                className="aspect-square flex flex-col items-center justify-center rounded-lg"
                style={{
                  background: scheduledBoth
                    ? "linear-gradient(135deg, #00694520 50%, #C1121F20 50%)"
                    : scheduledHor ? "#00694520" : "#C1121F20",
                  border: `1.5px dashed ${scheduledBoth ? "#006945" : scheduledHor ? "#006945" : "#C1121F"}`,
                }}
                title={`${format(day, "d MMMM yyyy")} — Scheduled: ${scheduledBoth ? "House & Senate" : scheduledHor ? "House of Representatives" : "Senate"}`}
              >
                <span className={`text-sm font-medium ${scheduledHor ? "text-[#006945]" : "text-[#C1121F]"}`}>
                  {format(day, "d")}
                </span>
              </div>
            );
          }

          return (
            <div key={dateStr} className="aspect-square flex items-center justify-center">
              <span className={`text-sm ${isToday ? "font-bold text-gray-900" : isWeekend || isPast ? "text-gray-200" : "text-gray-400"}`}>
                {format(day, "d")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-5 text-xs text-gray-500 pt-1">
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-sm bg-[#006945] inline-block" /> House — data available
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-sm bg-[#C1121F] inline-block" /> Senate — data available
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-sm border-2 border-dashed border-[#006945] inline-block" /> Scheduled sitting
        </span>
      </div>
    </div>
  );
}
