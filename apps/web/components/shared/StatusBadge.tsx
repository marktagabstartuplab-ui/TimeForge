import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-[#e4e2e3] text-brand-muted",
  info: "bg-brand-cyan/15 text-brand",
  success: "bg-[#f0fdf4] text-[#16a34a]",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
  brand: "bg-brand text-white",
};

/** Maps backend timesheet statuses to a display label + tone. */
export function timesheetStatusTone(status: string): { label: string; tone: BadgeTone } {
  switch (status) {
    case "DRAFT":
      return { label: "Draft", tone: "neutral" };
    case "SUBMITTED":
      return { label: "Submitted", tone: "info" };
    case "UNDER_REVIEW":
      return { label: "Under Review", tone: "warning" };
    case "APPROVED":
      return { label: "Approved", tone: "success" };
    case "REJECTED":
      return { label: "Rejected", tone: "danger" };
    case "REVISION_REQUESTED":
      return { label: "Revision Requested", tone: "warning" };
    case "PAYROLL_READY":
      return { label: "Payroll Ready", tone: "success" };
    default:
      return { label: status, tone: "neutral" };
  }
}

/** Maps backend payroll period statuses to employee-facing payslip labels. */
export function payrollStatusTone(status: string): { label: string; tone: BadgeTone } {
  switch (status) {
    case "OPEN":
      return { label: "Pending", tone: "neutral" };
    case "GENERATED":
      return { label: "Processing", tone: "warning" };
    case "APPROVED":
    case "LOCKED":
      return { label: "Approved", tone: "info" };
    case "EXPORTED":
      return { label: "Paid", tone: "success" };
    default:
      return { label: status, tone: "neutral" };
  }
}

interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  className?: string;
}

export function StatusBadge({ label, tone = "neutral", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
