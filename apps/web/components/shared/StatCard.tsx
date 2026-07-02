import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  badge?: string;
  disabled?: boolean;
}

export function StatCard({ icon: Icon, label, value, badge, disabled }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex-1 rounded-[16px] border border-[#c3c6d2]/50 p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]",
        disabled ? "bg-[#faf9f9]" : "bg-white",
      )}
    >
      <div className="flex items-start justify-between">
        <Icon className={cn("h-[26px] w-[26px]", disabled ? "text-brand-muted/40" : "text-brand")} aria-hidden="true" />
        {badge ? (
          <span className="rounded-full bg-[#f0fdf4] px-2 py-0.5 text-xs font-bold text-[#16a34a]">{badge}</span>
        ) : null}
      </div>
      <p className="mt-2 text-base text-brand-muted">{label}</p>
      <p className={cn("text-2xl font-bold", disabled ? "text-brand-muted/60" : "text-brand-ink")}>{value}</p>
    </div>
  );
}
