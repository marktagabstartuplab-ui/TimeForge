"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { listEmployees } from "@/features/employee-management/api/employee-management.service";

function statusTone(status: string): { label: string; tone: BadgeTone } {
  switch (status) {
    case "ACTIVE":
      return { label: "Active", tone: "success" };
    case "INVITED":
      return { label: "Invited", tone: "info" };
    case "PENDING":
      return { label: "Pending", tone: "warning" };
    case "SUSPENDED":
      return { label: "Suspended", tone: "danger" };
    case "DEACTIVATED":
      return { label: "Deactivated", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

/**
 * Supervisor "My Team" — a read-only, department-scoped employee directory.
 * Reuses the existing GET /employees API, which enforces department scoping
 * server-side for supervisors (they only ever receive their own department's
 * members), so no client-side filtering is relied on for security.
 */
export function TeamDirectoryContent() {
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["team-directory", "employees"],
    queryFn: () => listEmployees({ limit: 100 }),
  });

  const rows = useMemo(() => {
    const all = data?.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((e) =>
      `${e.firstName} ${e.lastName} ${e.email}`.toLowerCase().includes(q),
    );
  }, [data, search]);

  const departmentName = data?.data.find((e) => e.department)?.department?.name ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My Team"
        subtitle={
          departmentName
            ? `Employees and interns in ${departmentName}.`
            : "Employees and interns in your department."
        }
      />

      <SectionCard
        title="Team Members"
        action={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-muted" aria-hidden="true" />
            <Input
              placeholder="Search team members…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        }
      >
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : isError ? (
          <ErrorState message="Couldn't load your team." onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            message={
              search
                ? "No team members match your search."
                : "No employees are assigned to your department yet."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold uppercase tracking-wider text-brand-muted">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Employment</th>
                  <th className="py-3 pr-4">Department</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/30">
                {rows.map((e) => {
                  const roleName = e.employmentType === "INTERN" ? "INTERN" : (e.roles[0]?.role.name ?? "—");
                  const isIntern = e.employmentType === "INTERN";
                  const { label, tone } = statusTone(e.status);
                  return (
                    <tr key={e.id} className="hover:bg-gray-50/50">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <Avatar
                            firstName={e.firstName}
                            lastName={e.lastName}
                            imageUrl={e.avatarUrl}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-brand-navy">
                              {e.firstName} {e.lastName}
                            </p>
                            <p className="truncate text-xs text-brand-muted">{e.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-brand-ink">{roleName}</td>
                      <td className="py-3 pr-4">
                        {isIntern ? (
                          <StatusBadge label="Intern" tone="info" />
                        ) : (
                          <span className="text-brand-ink">Employee</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-brand-muted">{e.department?.name ?? "—"}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge label={label} tone={tone} />
                      </td>
                      <td className="py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              e.liveStatus === "ACTIVE"
                                ? "bg-emerald-500"
                                : e.liveStatus === "ON_BREAK"
                                  ? "bg-amber-400"
                                  : "bg-slate-300"
                            }`}
                          />
                          <span className="text-xs text-brand-muted">
                            {e.liveStatus === "ACTIVE" ? "Active" : e.liveStatus === "ON_BREAK" ? "On Break" : "Offline"}
                          </span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
