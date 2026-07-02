"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PencilLine } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatMinutes } from "@/lib/time";
import { listClients, listProjects, listWorkCategories } from "../api/catalog.service";
import type { DaySummary } from "../lib/day-summary";
import { EditSessionDialog } from "./EditSessionDialog";

/**
 * "Current Context" quick-info card under the stopwatch: session status,
 * what the running entry is booked against, and today's totals. The running
 * session's context can be edited in place (task switching).
 */
export function CurrentContextCard({ summary }: { summary: DaySummary }) {
  const [editOpen, setEditOpen] = useState(false);
  const running = summary.running;

  const { data: projects } = useQuery({ queryKey: ["catalog", "projects"], queryFn: listProjects });
  const { data: clients } = useQuery({ queryKey: ["catalog", "clients"], queryFn: listClients });
  const { data: categories } = useQuery({
    queryKey: ["catalog", "work-categories"],
    queryFn: listWorkCategories,
  });

  const nameOf = (list: { id: string; name: string }[] | undefined, id: string | null) =>
    (id && list?.find((item) => item.id === id)?.name) || null;

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Status",
      value: running ? (
        <StatusBadge label="Running" tone="success" />
      ) : (
        <StatusBadge label="Idle" tone="neutral" />
      ),
    },
    ...(running
      ? [
          {
            label: "Project",
            value: (
              <span className="text-sm font-bold text-brand-ink">
                {nameOf(projects, running.projectId) ?? "Unassigned"}
              </span>
            ),
          },
          {
            label: "Client",
            value: (
              <span className="text-sm font-bold text-brand-ink">
                {nameOf(clients, running.clientId) ?? "—"}
              </span>
            ),
          },
          {
            label: "Category",
            value: (
              <span className="text-sm font-bold text-brand-ink">
                {nameOf(categories, running.workCategoryId) ?? "—"}
              </span>
            ),
          },
        ]
      : []),
    {
      label: "Today's Total",
      value: <span className="text-sm font-bold text-brand-ink">{formatMinutes(summary.trackedMinutes)}</span>,
    },
    {
      label: "Breaks",
      value: <span className="text-sm font-bold text-brand-ink">{formatMinutes(summary.breakMinutes)}</span>,
    },
    {
      label: "Entries",
      value: <span className="text-sm font-bold text-brand-ink">{summary.entryCount}</span>,
    },
  ];

  return (
    <div className="flex flex-col rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between">
        <h3 className="text-xl text-brand-navy">Current Context</h3>
        {running ? (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 text-sm font-bold text-brand hover:underline"
          >
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            Edit
          </button>
        ) : null}
      </div>

      {running?.description ? (
        <p className="mt-2 line-clamp-2 rounded-[8px] bg-[#f6f3f4] px-3 py-2 text-sm text-brand-muted">
          {running.description}
        </p>
      ) : null}

      <dl className="mt-4 flex flex-col">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={
              i === 0
                ? "flex items-center justify-between py-2.5"
                : "flex items-center justify-between border-t border-[#c3c6d2]/40 py-2.5"
            }
          >
            <dt className="text-sm text-brand-muted">{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      {running ? (
        <EditSessionDialog
          key={running.id + String(editOpen)}
          open={editOpen}
          onOpenChange={setEditOpen}
          entry={running}
        />
      ) : null}
    </div>
  );
}
