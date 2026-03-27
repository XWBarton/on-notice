"use client";

import { useState } from "react";
import {
  format, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, addMonths, subMonths, isToday,
} from "date-fns";

export type HouseInfo = {
  confirmed: boolean;    // sitting_days row exists — parliament actually sat
  textComplete: boolean; // pipeline finished, summaries/transcripts available
  hasAudioClips: boolean;
  hasPodcast: boolean;
};

interface CalendarViewProps {
  dataMap: Record<string, Record<string, HouseInfo>>;
  scheduledDates: Record<string, string[]>;
}

const HOR_COLOR = "#006945";
const SEN_COLOR = "#C1121F";

// Returns 0–5:
// 0 = nothing, 1 = scheduled, 2 = confirmed (processing), 3 = text ready, 4 = audio clips, 5 = podcast
function getLevel(info: HouseInfo | undefined, isScheduled: boolean): 0 | 1 | 2 | 3 | 4 | 5 {
  if (info?.hasPodcast) return 5;
  if (info?.hasAudioClips) return 4;
  if (info?.textComplete) return 3;
  if (info?.confirmed) return 2;
  if (isScheduled) return 1;
  return 0;
}

function getDotStyle(level: 0 | 1 | 2 | 3 | 4 | 5, color: string): React.CSSProperties | null {
  if (level === 0) return null;
  if (level === 1) return { backgroundColor: "transparent", border: `1.5px solid ${color}40`, borderColor: color };
  if (level === 2) return { backgroundColor: color + "40" };
  if (level === 3) return { backgroundColor: color + "99" };
  if (level === 4) return { backgroundColor: color };
  // level 5: podcast — outer ring
  return { backgroundColor: color, boxShadow: `0 0 0 1.5px white, 0 0 0 3px ${color}` };
}

function buildTitle(
  dateStr: string,
  horLevel: number,
  senLevel: number,
): string {
  const labels = ["", "Scheduled", "Processing", "Summaries ready", "Audio clips ready", "Podcast ready"];
  const parts: string[] = [format(new Date(dateStr + "T12:00:00"), "d MMMM yyyy")];
  if (horLevel > 0) parts.push(`House: ${labels[horLevel]}`);
  if (senLevel > 0) parts.push(`Senate: ${labels[senLevel]}`);
  return parts.join(" · ");
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

          const dayInfo = dataMap[dateStr] ?? {};
          const scheduled = scheduledDates[dateStr] ?? [];

          const horInfo = dayInfo["fed_hor"];
          const senInfo = dayInfo["fed_sen"];
          const horScheduled = scheduled.includes("fed_hor");
          const senScheduled = scheduled.includes("fed_sen");

          const horLevel = getLevel(horInfo, horScheduled);
          const senLevel = getLevel(senInfo, senScheduled);

          const hasAnyActivity = horLevel > 0 || senLevel > 0;
          const hasConfirmedData = (horInfo?.confirmed || senInfo?.confirmed);

          const horDotStyle = getDotStyle(horLevel, HOR_COLOR);
          const senDotStyle = getDotStyle(senLevel, SEN_COLOR);

          const inner = (
            <div className="flex flex-col items-center py-1.5">
              <span className={`text-sm leading-none ${
                todayDate ? "font-bold text-gray-900"
                : isWeekend ? "text-gray-200"
                : hasConfirmedData ? "text-gray-800 font-medium"
                : hasAnyActivity ? "text-gray-500"
                : "text-gray-300"
              }`}>
                {format(day, "d")}
              </span>
              <div className="flex gap-0.5 mt-1 justify-center">
                {horDotStyle && (
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={horDotStyle} />
                )}
                {senDotStyle && (
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={senDotStyle} />
                )}
              </div>
            </div>
          );

          if (hasAnyActivity) {
            return (
              <a
                key={dateStr}
                href={`/${dateStr}`}
                className={`rounded-lg hover:bg-gray-50 transition-colors ${todayDate ? "ring-1 ring-gray-200" : ""}`}
                title={buildTitle(dateStr, horLevel, senLevel)}
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
      <div className="space-y-2 pt-1">
        <div className="flex gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#006945] inline-block" /> House
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#C1121F] inline-block" /> Senate
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ border: "1.5px solid #888" }} />
            Scheduled
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block bg-gray-300" />
            Processing
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block bg-gray-400" />
            Summaries
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block bg-gray-600" />
            Audio clips
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block bg-gray-600" style={{ boxShadow: "0 0 0 1.5px white, 0 0 0 3px #666" }} />
            Podcast
          </span>
        </div>
      </div>
    </div>
  );
}
