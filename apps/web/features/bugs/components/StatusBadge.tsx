import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import type { BugPriority, BugSeverity, BugStatus } from "../api/bugs.service";

export function bugStatusTone(status: string): { label: string; tone: BadgeTone } {
  switch (status) {
    case "OPEN":
      return { label: "Open", tone: "info" };
    case "IN_PROGRESS":
      return { label: "In Progress", tone: "warning" };
    case "FIXED":
      return { label: "Fixed", tone: "success" };
    case "CLOSED":
      return { label: "Closed", tone: "neutral" };
    case "BLOCKED":
      return { label: "Blocked", tone: "danger" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function bugPriorityTone(priority: string): { label: string; tone: BadgeTone } {
  switch (priority) {
    case "CRITICAL":
      return { label: "Critical", tone: "danger" };
    case "HIGH":
      return { label: "High", tone: "warning" };
    case "MEDIUM":
      return { label: "Medium", tone: "info" };
    case "LOW":
      return { label: "Low", tone: "neutral" };
    default:
      return { label: priority, tone: "neutral" };
  }
}

export function BugStatusBadge({ status }: { status: BugStatus }) {
  const { label, tone } = bugStatusTone(status);
  return <StatusBadge label={label} tone={tone} />;
}

export function BugPriorityBadge({ priority }: { priority: BugPriority }) {
  const { label, tone } = bugPriorityTone(priority);
  return <StatusBadge label={label} tone={tone} />;
}

export function BugSeverityBadge({ severity }: { severity: BugSeverity }) {
  // P0/P1 are the "drop everything" band; the rest are informational.
  const tone: BadgeTone = severity === "P0" || severity === "P1" ? "danger" : "neutral";
  return <StatusBadge label={severity} tone={tone} />;
}
