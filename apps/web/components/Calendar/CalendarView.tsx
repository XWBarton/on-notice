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

function ChamberChip({ level, color, label }: { level: 0 | 1 | 2 | 3 | 4 | 5; color: string; label: string }) {
  if (level === 0) return null;

  let style: React.CSSProperties;
  if (level === 1) {
    style = { backgroundColor: "transparent", color, border: `1.5px solid ${color}`, opacity: 0.7 };
  } else if (level === 2) {
    style = { backgroundColor: color + "22", color };
  } else if (level === 3) {
    style = { backgroundColor: color + "44", color };
  } else if (level === 4) {
    style = { backgroundColor: color + "cc", color: "white" };
  } else {
    // podcast
    style = { backgroundColor: color, color: "white", boxShadow: `0 0 0 2px white, 0 0 0 3.5px ${color}` };
  }

  return (
    <span
      className="text-[9px] font-bold leading-none px-[5px] py-[3px] rounded"
      style={style}
    >
      {label}
    </span>
  );
}

function buildTitle(dateStr: string, horLevel: number, senLevel: number): string {
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
    <div className="space-y-6">
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

      {/* Grid */}
      <div className="grid grid-cols-7">
        {/* Day headers */}
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d, i) => (
          <div key={i} className={`text-xs font-medium text-center pb-3 ${i >= 5 ? "text-gray-200" : "text-gray-400"}`}>
            {d}
          </div>
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
          const hasConfirmedData = horInfo?.confirmed || senInfo?.confirmed;

          const inner = (
            <div className="flex flex-col items-center py-2 min-h-[52px]">
              {todayDate ? (
                <span className="w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold">
                  {format(day, "d")}
                </span>
              ) : (
                <span className={`text-sm leading-none ${
                  isWeekend ? "text-gray-200"
                  : hasConfirmedData ? "text-gray-800 font-semibold"
                  : hasAnyActivity ? "text-gray-500"
                  : "text-gray-300"
                }`}>
                  {format(day, "d")}
                </span>
              )}
              {hasAnyActivity && (
                <div className="flex gap-1 mt-2 justify-center">
                  <ChamberChip level={horLevel} color={HOR_COLOR} label="H" />
                  <ChamberChip level={senLevel} color={SEN_COLOR} label="S" />
                </div>
              )}
            </div>
          );

          if (hasAnyActivity) {
            return (
              <a
                key={dateStr}
                href={`/${dateStr}`}
                className="rounded-lg hover:bg-gray-50 transition-colors text-center"
                title={buildTitle(dateStr, horLevel, senLevel)}
              >
                {inner}
              </a>
            );
          }

          return (
            <div key={dateStr} className="rounded-lg text-center">
              {inner}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="pt-3 border-t border-gray-100 space-y-3">
        <div className="flex gap-5 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <ChamberChip level={4} color={HOR_COLOR} label="H" />
            House of Representatives
          </span>
          <span className="flex items-center gap-1.5">
            <ChamberChip level={4} color={SEN_COLOR} label="S" />
            Senate
          </span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-400 items-center">
          <span className="flex items-center gap-1.5">
            <ChamberChip level={1} color={HOR_COLOR} label="H" />
            Scheduled
          </span>
          <span className="flex items-center gap-1.5">
            <ChamberChip level={2} color={HOR_COLOR} label="H" />
            Processing
          </span>
          <span className="flex items-center gap-1.5">
            <ChamberChip level={3} color={HOR_COLOR} label="H" />
            Summaries
          </span>
          <span className="flex items-center gap-1.5">
            <ChamberChip level={4} color={HOR_COLOR} label="H" />
            Audio clips
          </span>
          <span className="flex items-center gap-1.5">
            <ChamberChip level={5} color={HOR_COLOR} label="H" />
            Podcast
          </span>
        </div>
      </div>
    </div>
  );
}
