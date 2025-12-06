/**
 * 범위 선택 컨트롤 컴포넌트
 */

import { renderCount } from "@/lib/utils/videoUtils";

interface RangeControlProps {
  label: string;
  value: { min: number; max: number };
  min: number;
  max: number;
  step: number;
  onChange: (next: { min: number; max: number }) => void;
  suffix?: string;
  useLogScale?: boolean;
}

export default function RangeControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix = "",
  useLogScale = false,
}: RangeControlProps) {
  // 로그 스케일 변환 함수
  const toLog = (val: number) => {
    if (!useLogScale) return val;
    return Math.log10(Math.max(val, 1));
  };

  const fromLog = (logVal: number) => {
    if (!useLogScale) return logVal;
    return Math.round(Math.pow(10, logVal));
  };

  const logMin = toLog(min);
  const logMax = toLog(max);
  const logStep = useLogScale ? 0.01 : step; // 로그 스케일에서는 작은 step 사용

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-100">{label}</span>
        <span className="text-xs text-slate-300" suppressHydrationWarning>
          {renderCount(value.min)}{suffix} ~ {renderCount(value.max)}{suffix}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={logMin}
          max={logMax}
          step={logStep}
          value={toLog(value.min)}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-emerald-400"
          onChange={(event) => {
            const nextMin = fromLog(Number(event.target.value));
            const minGap = useLogScale ? 1 : step;
            onChange({ min: Math.min(nextMin, value.max - minGap), max: value.max });
          }}
          suppressHydrationWarning
        />
        <input
          type="range"
          min={logMin}
          max={logMax}
          step={logStep}
          value={toLog(value.max)}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-emerald-400"
          onChange={(event) => {
            const nextMax = fromLog(Number(event.target.value));
            const minGap = useLogScale ? 1 : step;
            onChange({ min: value.min, max: Math.max(nextMax, value.min + minGap) });
          }}
          suppressHydrationWarning
        />
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs text-slate-200">
        <label className="flex flex-col gap-1">
          <span className="font-medium">최소</span>
          <input
            type="number"
            min={min}
            max={value.max - (useLogScale ? 1 : step)}
            step={useLogScale ? 1 : step}
            value={value.min}
            onChange={(event) => {
              const minGap = useLogScale ? 1 : step;
              const nextMin = Math.min(Number(event.target.value), value.max - minGap);
              onChange({ min: nextMin, max: value.max });
            }}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white focus:border-emerald-300 focus:outline-none"
            suppressHydrationWarning
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">최대</span>
          <input
            type="number"
            min={value.min + (useLogScale ? 1 : step)}
            max={max}
            step={useLogScale ? 1 : step}
            value={value.max}
            onChange={(event) => {
              const minGap = useLogScale ? 1 : step;
              const nextMax = Math.max(Number(event.target.value), value.min + minGap);
              onChange({ min: value.min, max: nextMax });
            }}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white focus:border-emerald-300 focus:outline-none"
            suppressHydrationWarning
          />
        </label>
      </div>
    </div>
  );
}
