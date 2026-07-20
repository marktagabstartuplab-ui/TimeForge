import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import type { TeamMemberPresence } from "@/features/account/api/account.service";

interface TeamStatusListProps {
  isLoading: boolean;
  members: TeamMemberPresence[] | undefined;
}

/** Department-peer presence list: every role can see it (own-department, non-sensitive),
 *  shared between the Dashboard and Payslips "Team Status" cards so they stay in sync. */
export function TeamStatusList({ isLoading, members }: TeamStatusListProps) {
  if (isLoading) {
    return <p className="text-sm text-brand-muted">Loading…</p>;
  }
  if (!members || members.length === 0) {
    return <EmptyState message="No team members in department yet." />;
  }
  return (
    <ul className="flex flex-col divide-y divide-[#c3c6d2]/40">
      {members.map((m) => {
        const { label, tone } =
          m.liveStatus === "ACTIVE"
            ? { label: "Clocked In", tone: "success" as const }
            : m.liveStatus === "ON_BREAK"
              ? { label: "On Break", tone: "warning" as const }
              : { label: "Clocked Out", tone: "neutral" as const };
        return (
          <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex flex-col min-w-0">
              <span className="truncate text-sm font-medium text-brand-navy">
                {m.firstName} {m.lastName}
              </span>
              {m.jobTitle && (
                <span className="truncate text-[11px] text-brand-muted">{m.jobTitle}</span>
              )}
            </div>
            <div className="flex shrink-0 items-center">
              <StatusBadge label={label} tone={tone} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
