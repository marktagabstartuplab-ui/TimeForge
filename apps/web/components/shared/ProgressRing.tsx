import { cn } from "@/lib/utils";

interface ProgressRingProps {
  /** 0..100 */
  percent: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
}

/** SVG donut used for the Reports "Overall Score" card. */
export function ProgressRing({ percent, size = 168, strokeWidth = 16, className, label }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      role="img"
      aria-label={label ?? `${Math.round(clamped)} percent`}
      className={cn("relative inline-flex items-center justify-center", className)}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e4e2e3"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-[34px] font-bold leading-none text-brand-ink">{Math.round(clamped)}%</span>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-[1.5px] text-brand-muted">Score</span>
      </div>
    </div>
  );
}
