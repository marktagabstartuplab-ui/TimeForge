"use client";

import { useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectRow, ProjectStatus } from "../api/org-management.service";

const PREVIEW_COUNT = 5;

function statusTone(status: ProjectStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case "ON_TRACK":
      return { label: "On Track", tone: "success" };
    case "AT_RISK":
      return { label: "At Risk", tone: "danger" };
    case "DELAYED":
      return { label: "Delayed", tone: "warning" };
    default:
      return { label: status, tone: "neutral" };
  }
}

interface ActiveProjectsTableProps {
  projects: ProjectRow[] | undefined;
  isLoading: boolean;
  onEdit: (project: ProjectRow) => void;
  onDelete: (project: ProjectRow) => void;
}

export function ActiveProjectsTable({ projects, isLoading, onEdit, onDelete }: ActiveProjectsTableProps) {
  const [showAll, setShowAll] = useState(false);
  const rows = projects ?? [];
  const visible = showAll ? rows : rows.slice(0, PREVIEW_COUNT);

  const onTrack = rows.filter((p) => p.status === "ON_TRACK").length;
  const atRisk = rows.filter((p) => p.status === "AT_RISK" || p.status === "DELAYED").length;

  return (
    <SectionCard
      title="Active Projects Overview"
      action={
        <div className="flex items-center gap-2">
          {rows.length > 0 ? (
            <>
              <StatusBadge label={`${onTrack} On Track`} tone="success" />
              {atRisk > 0 ? <StatusBadge label={`${atRisk} At Risk`} tone="danger" /> : null}
            </>
          ) : null}
          {rows.length > PREVIEW_COUNT ? (
            <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show Less" : "See All"}
            </button>
          ) : null}
        </div>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState message="No projects yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#c3c6d2]/50 text-xs font-semibold uppercase tracking-wide text-brand-muted">
                <th className="pb-2 pr-4">Project Name</th>
                <th className="pb-2 pr-4">Assigned Dept</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4 text-center">Team Size</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c3c6d2]/30">
              {visible.map((p) => {
                const { label, tone } = statusTone(p.status);
                return (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-4 font-medium text-brand-ink">{p.name}</td>
                    <td className="py-2.5 pr-4">
                      {p.department ? (
                        <span className="rounded-full bg-[#e4e2e3] px-2 py-0.5 text-xs font-medium text-brand-ink">{p.department.name}</span>
                      ) : (
                        <span className="text-brand-muted">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4"><StatusBadge label={label} tone={tone} /></td>
                    <td className="py-2.5 pr-4 text-center text-brand-ink">{p.teamSize} Members</td>
                    <td className="py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button type="button" className="rounded-md p-1 text-brand-muted hover:bg-[#f6f3f4]" aria-label="Project actions">
                              <MoreVertical className="h-4 w-4" aria-hidden="true" />
                            </button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(p)}>
                            <Pencil aria-hidden="true" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => onDelete(p)}>
                            <Trash2 aria-hidden="true" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
