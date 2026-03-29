"use client";

interface Props {
  value: number;
  min?: number;
  max?: number;
  onChange: (year: number) => void;
  isLoading?: boolean;
}

const CURRENT_YEAR = new Date().getFullYear();

export default function TimeSlider({
  value,
  min = 2006,
  max = CURRENT_YEAR,
  onChange,
  isLoading,
}: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white border-t border-gray-200 flex-shrink-0">
      <span className="text-xs text-gray-400 w-8 text-right tabular-nums">{min}</span>

      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-gray-400 whitespace-nowrap">
            loading…
          </div>
        )}
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200 accent-gray-800"
        />
      </div>

      <span className="text-xs text-gray-400 w-8 tabular-nums">{max}</span>

      <div className="text-xs font-medium text-gray-700 w-20 text-right tabular-nums">
        From {value}
      </div>
    </div>
  );
}
