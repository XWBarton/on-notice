"use client";

import { useState } from "react";
import {
  format, parseISO, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, addMonths, subMonths, isToday, isFuture,
} from "date-fns";

interface CalendarViewProps {
  dataMap: Record<string, string[]>;
  scheduledDates: Record<string, string[]>;
}

export function CalendarView({ dataMap, scheduledDates }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = (getDay(monthStart) + 6) % 7;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sitting Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors text-lg"
          >
            ‹
          </button>
          <span className="text-sm font-semibold w-28 text-center text-gray-700">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <button
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors text-lg"
          >
            ›
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-xs text-gray-300 font-medium pb-2">{d}</div>
        ))}

        {/* Padding */}
        {Array.from({ length: startPad }).map((_, i) => <div key={`p${i}`} />)}

        {/* Days */}
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const isWeekend = getDay(day) === 0 || getDay(day) === 6;
          const todayDate = isToday(day);
          const future = isFuture(day);

          const dataParls = dataMap[dateStr] ?? [];
          const scheduled = scheduledDates[dateStr] ?? [];

          const hasHorData = dataParls.includes("fed_hor");
          const hasSenData = dataParls.includes("fed_sen");
          const hasAnyData = hasHorData || hasSenData;

          const scheduledHor = !hasHorData && scheduled.includes("fed_hor");
          const scheduledSen = !hasSenData && scheduled.includes("fed_sen");
          const hasAnyScheduled = scheduledHor || scheduledSen;

          const isClickable = hasAnyData || hasAnyScheduled;

          const dateNum = (
            <span className={`text-sm leading-none ${
              todayDate
                ? "font-bold text-gray-900"
                : isWeekend
                ? "text-gray-200"
                : hasAnyData
                ? "text-gray-800 font-medium"
                : hasAnyScheduled
                ? "text-gray-500"
                : "text-gray-300"
            }`}>
              {format(day, "d")}
            </span>
          );

          const dots = (
            <div className="flex gap-0.5 mt-1 justify-center">
              {/* House dot */}
              {(hasHorData || scheduledHor) && (
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{
                    backgroundColor: hasHorData ? "#006945" : "#00694540",
                    border: scheduledHor ? "1px solid #006945" : "none",
                  }}
                />
              )}
              {/* Senate dot */}
              {(hasSenData || scheduledSen) && (
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{
                    backgroundColor: hasSenData ? "#C1121F" : "#C1121F40",
                    border: scheduledSen ? "1px solid #C1121F" : "none",
                  }}
                />
              )}
            </div>
          );

          const inner = (
            <div className="flex flex-col items-center py-1.5">
              {dateNum}
              {dots}
            </div>
          );

          if (isClickable) {
            return (
              <a
                key={dateStr}
                href={`/${dateStr}`}
                className={`rounded-lg hover:bg-gray-50 transition-colors ${todayDate ? "ring-1 ring-gray-200" : ""}`}
                title={format(day, "d MMMM yyyy")}
              >
                {inner}
              </a>
            );
          }

          return (
            <div key={dateStr} className={`rounded-lg ${todayDate ? "ring-1 ring-gray-200" : ""}`}>
              {inner}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-5 text-xs text-gray-400 pt-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#006945] inline-block" /> House
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#C1121F] inline-block" /> Senate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-200 inline-block" /> Scheduled
        </span>
      </div>
    </div>
  );
}
