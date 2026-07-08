import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  icon?: LucideIcon;
  /** Tint behind the icon box, e.g. "bg-brand-cyan/15 text-brand". */
  iconTone?: string;
  label: string;
  value: string;
  valueSuffix?: string;
  caption?: React.ReactNode;
  /** Highlighted card (brand border), e.g. Est. Total Payout. */
  emphasis?: boolean;
  className?: string;
}

/**
 * Compact metric tile used on Submit Timesheet / Payslips / Reports: boxed
 * icon top-left (or top-right per design), uppercase-ish label, large value.
 */
export function MetricCard({
  icon: Icon,
  iconTone = "bg-brand-cyan/15 text-brand",
  label,
  value,
  valueSuffix,
  caption,
  emphasis,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-[16px] border bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]",
        emphasis ? "border-2 border-brand" : "border-[#c3c6d2]/50",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            "text-xs font-bold uppercase tracking-[0.6px]",
            emphasis ? "text-brand" : "text-brand-muted",
          )}
        >
          {label}
        </p>
        {Icon ? (
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]", iconTone)}>
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="text-[26px] font-bold leading-none text-brand-ink">
        {value}
        {valueSuffix ? (
          <span className="ml-1 text-sm font-normal text-brand-muted">{valueSuffix}</span>
        ) : null}
      </p>
      {caption ? <div className="text-xs text-brand-muted">{caption}</div> : null}
    </div>
  );
}
