"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DepartmentRow } from "../api/org-management.service";

const PREVIEW_COUNT = 5;

interface DepartmentDirectoryTableProps {
  departments: DepartmentRow[] | undefined;
  isLoading: boolean;
  onEdit: (dept: DepartmentRow) => void;
  onDelete: (dept: DepartmentRow) => void;
}

export function DepartmentDirectoryTable({ departments, isLoading, onEdit, onDelete }: DepartmentDirectoryTableProps) {
  const [showAll, setShowAll] = useState(false);
  const router = useRouter();
  const rows = departments ?? [];
  const visible = showAll ? rows : rows.slice(0, PREVIEW_COUNT);

  return (
    <SectionCard
      title="Department Directory"
      action={
        rows.length > PREVIEW_COUNT ? (
          <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show Less" : "See All"}
          </button>
        ) : null
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState message="No departments yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#c3c6d2]/50 text-xs font-semibold uppercase tracking-wide text-brand-muted">
                <th className="pb-2 pr-4">Department</th>
                <th className="pb-2 pr-4">Head of Dept</th>
                <th className="pb-2 pr-4 text-center">Projects</th>
                <th className="pb-2 pr-4 text-center">Staff Count</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c3c6d2]/30">
              {visible.map((d) => (
                <tr key={d.id}>
                  <td className="py-2.5 pr-4">
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/departments/${d.id}`)}
                      className="font-medium text-brand hover:underline"
                    >
                      {d.name}
                    </button>
                  </td>
                  <td className="py-2.5 pr-4 text-brand-muted">
                    {d.manager ? `${d.manager.firstName} ${d.manager.lastName}` : "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-center text-brand-ink">{d.projectCount}</td>
                  <td className="py-2.5 pr-4 text-center text-brand-ink">{d.staffCount}</td>
                  <td className="py-2.5 pr-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${d.isActive !== false ? "text-[#16a34a]" : "text-gray-400"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${d.isActive !== false ? "bg-[#16a34a]" : "bg-gray-400"}`} />
                      {d.isActive !== false ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button type="button" className="rounded-md p-1 text-brand-muted hover:bg-[#f6f3f4]" aria-label="Department actions">
                            <MoreVertical className="h-4 w-4" aria-hidden="true" />
                          </button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(d)}>
                          <Pencil aria-hidden="true" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => onDelete(d)}>
                          <Trash2 aria-hidden="true" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
