import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** 0..100; values outside the range are clamped. */
  percent: number;
  /** Bar fill class, defaults to brand blue. */
  barClassName?: string;
  className?: string;
  label?: string;
}

export function ProgressBar({ percent, barClassName, className, label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-[#e4e2e3]", className)}
    >
      <div
        className={cn("h-full rounded-full bg-brand transition-[width] duration-300", barClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
