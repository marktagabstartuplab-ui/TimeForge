"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { getAdminRecent } from "../api/admin-dashboard.service";

type Tab = "audit" | "approvals" | "payroll" | "registrations";

const TABS: { value: Tab; label: string }[] = [
  { value: "audit", label: "Audit Logs" },
  { value: "approvals", label: "Approvals" },
  { value: "payroll", label: "Payroll" },
  { value: "registrations", label: "Registrations" },
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function actionLabel(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function RecentActivityPanel() {
  const [tab, setTab] = useState<Tab>("audit");
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "dashboard", "recent"],
    queryFn: getAdminRecent,
  });

  return (
    <SectionCard
      title="Recent Activity"
      action={
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTab key={t.value} value={t.value}>
                {t.label}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (
        <>
          {tab === "audit" ? (
            data && data.auditLogs.length > 0 ? (
              <ul className="flex flex-col divide-y divide-[#c3c6d2]/40">
                {data.auditLogs.map((log) => (
                  <li key={log.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-medium text-brand-ink">{actionLabel(log.action)}</span>
                    <span className="text-xs text-brand-muted">{formatDateTime(log.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message="No audit log entries yet." />
            )
          ) : null}

          {tab === "approvals" ? (
            data && data.approvals.length > 0 ? (
              <ul className="flex flex-col divide-y divide-[#c3c6d2]/40">
                {data.approvals.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-medium text-brand-ink">
                      {a.supervisor.firstName} {a.supervisor.lastName} — {actionLabel(a.lastAction)}
                    </span>
                    <span className="text-xs text-brand-muted">{formatDateTime(a.actedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message="No approval decisions yet." />
            )
          ) : null}

          {tab === "payroll" ? (
            data && data.payrollGenerations.length > 0 ? (
              <ul className="flex flex-col divide-y divide-[#c3c6d2]/40">
                {data.payrollGenerations.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-medium text-brand-ink">
                      {actionLabel(p.period.type)} payroll generated
                    </span>
                    <span className="text-xs text-brand-muted">{formatDateTime(p.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message="No payroll runs generated yet." />
            )
          ) : null}

          {tab === "registrations" ? (
            data && data.userRegistrations.length > 0 ? (
              <ul className="flex flex-col divide-y divide-[#c3c6d2]/40">
                {data.userRegistrations.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-medium text-brand-ink">
                      {u.firstName} {u.lastName}
                    </span>
                    <span className="text-xs text-brand-muted">{formatDateTime(u.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState message="No user registrations yet." />
            )
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
