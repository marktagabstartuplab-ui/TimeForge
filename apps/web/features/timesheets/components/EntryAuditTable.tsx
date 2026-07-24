"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { listProjects, listWorkCategories, listClients } from "@/features/time-tracking/api/catalog.service";
import { listDepartments } from "@/features/schedules/api/departments-picker.service";
import { updateTimeEntry, deleteTimeEntry, type TimeEntry } from "@/features/time-tracking/api/time-entries.service";
import { formatClockTime, formatMinutesClock, minutesBetween, toIsoDate } from "@/lib/time";
import { Edit2, Trash2, X, Loader2 } from "lucide-react";

const COLLAPSED_ROWS = 6;

interface EntryAuditTableProps {
  entries: TimeEntry[];
  /** Days whose totals exceed 8h (rows get an Overtime badge). */
  overtimeDays: Set<string>;
  periodDayCount: number;
  timesheetStatus?: string;
  onRefresh?: () => void;
  /** When set (YYYY-MM-DD), the table only shows that day's entries, with a banner to clear it. */
  highlightDate?: string | null;
  onClearHighlightDate?: () => void;
  /** The employee's own assigned department — shown locked in the edit form. */
  employeeDepartmentName?: string | null;
}

function parseIsoToLocalDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoToLocalTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Formats a YYYY-MM-DD (local) key as e.g. "Thu, Jul 23, 2026". */
function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Timesheet Entry Audit" table (Submit Timesheet, Figma 127:2792). */
export function EntryAuditTable({
  entries,
  overtimeDays,
  periodDayCount,
  timesheetStatus,
  onRefresh,
  highlightDate,
  onClearHighlightDate,
  employeeDepartmentName,
}: EntryAuditTableProps) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  // Dialog & Form states
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TimeEntry | null>(null);

  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editClientId, setEditClientId] = useState("");
  const [editWorkCategoryId, setEditWorkCategoryId] = useState("");
  const [editTask, setEditTask] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDeliverables, setEditDeliverables] = useState("");
  const [formError, setFormError] = useState("");

  const { data: projects } = useQuery({ queryKey: ["catalog", "projects"], queryFn: listProjects });
  const { data: clients } = useQuery({ queryKey: ["catalog", "clients"], queryFn: listClients });
  const { data: departments } = useQuery({ queryKey: ["catalog", "departments"], queryFn: listDepartments });
  const { data: categories } = useQuery({
    queryKey: ["catalog", "work-categories"],
    queryFn: listWorkCategories,
  });

  const startEditing = (e: TimeEntry) => {
    setEditingEntry(e);
    setEditDate(parseIsoToLocalDate(e.startTime));
    setEditStartTime(parseIsoToLocalTime(e.startTime));
    setEditEndTime(parseIsoToLocalTime(e.endTime));
    setEditProjectId(e.projectId ?? "");
    setEditClientId(e.clientId ?? "");
    setEditWorkCategoryId(e.workCategoryId ?? "");
    setEditTask(e.task ?? "");
    setEditDescription(e.description ?? "");
    setEditDeliverables(e.deliverables ?? "");
    setFormError("");
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingEntry) return;

      // Date, Start Time, End Time, and Department are permanently locked in
      // this audit — only project/client/category/task/description/
      // deliverables may change, regardless of timesheet status.
      await updateTimeEntry(editingEntry.id, {
        projectId: editProjectId || undefined,
        clientId: editClientId || undefined,
        workCategoryId: editWorkCategoryId || undefined,
        task: editTask || undefined,
        description: editDescription || undefined,
        deliverables: editDeliverables || undefined,
        version: editingEntry.version,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      setEditingEntry(null);
      if (onRefresh) onRefresh();
    },
    onError: (err: any) => {
      setFormError(err.message || "Failed to update entry");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deletingEntry) return;
      await deleteTimeEntry(deletingEntry.id, deletingEntry.version);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      setDeletingEntry(null);
      if (onRefresh) onRefresh();
    },
    onError: (err: any) => {
      alert(err.message || "Failed to delete entry");
    },
  });

  const dayEntries = highlightDate
    ? entries.filter((e) => toIsoDate(new Date(e.startTime)) === highlightDate)
    : entries;
  const visible = highlightDate || expanded ? dayEntries : dayEntries.slice(0, COLLAPSED_ROWS);
  const canEdit = timesheetStatus === "DRAFT" || timesheetStatus === "REJECTED" || timesheetStatus === "REVISION_REQUESTED";
  const isRevisionMode = timesheetStatus === "REVISION_REQUESTED";

  const columns: DataTableColumn<TimeEntry>[] = [
    {
      key: "project",
      header: "Project / Task",
      render: (e) => (
        <div>
          <p className="font-semibold text-brand">
            {(e.projectId && projects?.find((p) => p.id === e.projectId)?.name) || "No project"}
          </p>
          <p className="text-xs text-brand-muted">
            {(e.workCategoryId && categories?.find((c) => c.id === e.workCategoryId)?.name) || "General work"}
          </p>
        </div>
      ),
    },
    {
      key: "client",
      header: "Client",
      render: (e) => (
        <span className="text-sm text-brand-ink">
          {(e.clientId && clients?.find((c) => c.id === e.clientId)?.name) || "—"}
        </span>
      ),
    },
    {
      key: "department",
      header: "Department",
      render: (e) => (
        <span className="text-sm text-brand-ink">
          {(e.departmentId && departments?.find((d) => d.id === e.departmentId)?.name) || "—"}
        </span>
      ),
    },
    {
      key: "range",
      header: "Start/End",
      render: (e) => (
        <span className="whitespace-nowrap text-brand-muted">
          {formatClockTime(e.startTime)}
          {" → "}
          {e.endTime ? formatClockTime(e.endTime) : "running"}
        </span>
      ),
    },
    {
      key: "duration",
      header: "Duration",
      render: (e) => (
        <StatusBadge
          label={formatMinutesClock(
            e.durationMinutes ?? minutesBetween(e.startTime, e.endTime ?? new Date().toISOString()),
          )}
          tone="info"
        />
      ),
    },
    {
      key: "description",
      header: "Description",
      className: "max-w-[200px]",
      render: (e) => <span className="line-clamp-2 text-brand-ink">{e.description || "—"}</span>,
    },
    {
      key: "deliverables",
      header: "Deliverables",
      className: "max-w-[200px]",
      render: (e) => <span className="line-clamp-2 text-brand-ink">{e.deliverables || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      className: "text-right",
      render: (e) => {
        if (overtimeDays.has(toIsoDate(new Date(e.startTime)))) {
          return <StatusBadge label="Overtime" tone="info" className="bg-brand-cyan/25 text-brand" />;
        }
        return e.timesheetId ? (
          <StatusBadge label="Verified" tone="success" />
        ) : (
          <StatusBadge label="Unassigned" tone="neutral" />
        );
      },
    },
    ...(canEdit
      ? [
          {
            key: "actions",
            header: "Actions",
            className: "text-right",
            render: (e: TimeEntry) => (
              <div className="flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => startEditing(e)}
                  className="rounded p-1 text-brand hover:bg-[#f6f3f4]"
                  title="Edit time entry"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingEntry(e)}
                  className="rounded p-1 text-red-600 hover:bg-red-50"
                  title="Delete time entry"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div id="timesheet-entry-audit" className="flex flex-col rounded-[16px] border border-[#c3c6d2]/50 bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between px-[25px] pt-[25px] pb-4">
        <h3 className="text-xl text-brand-navy">Timesheet Entry Audit</h3>
      </div>
      {highlightDate ? (
        <div className="mx-[25px] mb-4 flex items-center justify-between gap-3 rounded-[10px] bg-brand-cyan/10 px-4 py-2.5 text-sm">
          <span className="text-brand-ink">
            Showing entries for{" "}
            <span className="font-semibold">{formatDayLabel(highlightDate)}</span>
          </span>
          {onClearHighlightDate && (
            <button
              type="button"
              onClick={onClearHighlightDate}
              className="font-bold text-brand hover:underline"
            >
              Show all period entries
            </button>
          )}
        </div>
      ) : null}
      <div className="px-[25px] pb-2">
        <DataTable
          aria-label="Timesheet entries for the current period"
          columns={columns}
          rows={visible}
          rowKey={(e) => e.id}
          emptyState={
            <EmptyState
              message={
                highlightDate
                  ? "No time entries for this day in the current pay period's timesheet."
                  : "No time entries in this pay period yet — log time from the Daily Scrum page."
              }
            />
          }
        />
      </div>
      {!highlightDate && entries.length > COLLAPSED_ROWS ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-b-[16px] border-t border-[#c3c6d2]/40 bg-[#faf9f9] py-3 text-sm font-bold text-brand hover:bg-[#f6f3f4]"
        >
          {expanded
            ? "Show fewer entries"
            : `View all ${entries.length} entries (${periodDayCount} days in period)`}
        </button>
      ) : (
        <div className="pb-4" />
      )}

      {/* Edit Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#c3c6d2]/30 pb-3 mb-4">
              <h3 className="text-lg font-bold text-brand-navy">
                {isRevisionMode ? "Revise Entry" : "Edit Time Entry"}
              </h3>
              <button type="button" onClick={() => setEditingEntry(null)} className="text-brand-muted hover:text-brand-ink">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
              <span className="font-bold">Date, Start Time, End Time, and Department are locked. </span>
              You may update the description, deliverables, task, project, and client.
            </div>

            {formError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-brand-muted block mb-1">Date</label>
                  <div className="h-10 rounded-lg border border-[#c3c6d2]/50 bg-[#f6f3f4] px-3 text-sm text-brand-muted flex items-center cursor-not-allowed">
                    {editDate}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-brand-muted block mb-1">Start Time</label>
                  <div className="h-10 rounded-lg border border-[#c3c6d2]/50 bg-[#f6f3f4] px-3 text-sm text-brand-muted flex items-center cursor-not-allowed">
                    {editStartTime}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-brand-muted block mb-1">End Time</label>
                  <div className="h-10 rounded-lg border border-[#c3c6d2]/50 bg-[#f6f3f4] px-3 text-sm text-brand-muted flex items-center cursor-not-allowed">
                    {editEndTime || "—"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-brand-muted block mb-1">Client</label>
                  <select
                    value={editClientId}
                    onChange={(e) => setEditClientId(e.target.value)}
                    className="w-full h-10 rounded-lg border border-[#c3c6d2] px-2 text-sm focus:border-brand outline-none bg-white"
                  >
                    <option value="">Select Client...</option>
                    {clients?.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-brand-muted block mb-1">Project</label>
                  <select
                    value={editProjectId}
                    onChange={(e) => setEditProjectId(e.target.value)}
                    className="w-full h-10 rounded-lg border border-[#c3c6d2] px-2 text-sm focus:border-brand outline-none bg-white"
                  >
                    <option value="">Select Project...</option>
                    {projects?.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-brand-muted block mb-1">Department</label>
                  <div className="h-10 rounded-lg border border-[#c3c6d2]/50 bg-[#f6f3f4] px-3 text-sm text-brand-muted flex items-center cursor-not-allowed">
                    {employeeDepartmentName || "—"}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-brand-muted block mb-1">Work Category</label>
                  <select
                    value={editWorkCategoryId}
                    onChange={(e) => setEditWorkCategoryId(e.target.value)}
                    className="w-full h-10 rounded-lg border border-[#c3c6d2] px-2 text-sm focus:border-brand outline-none bg-white"
                  >
                    <option value="">Select Category...</option>
                    {categories?.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-brand-muted block mb-1">Task Title</label>
                <input
                  type="text"
                  value={editTask}
                  onChange={(e) => setEditTask(e.target.value)}
                  placeholder="e.g. UI Refactoring"
                  className="w-full h-10 rounded-lg border border-[#c3c6d2] px-3 text-sm focus:border-brand outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-brand-muted block mb-1">Work Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  placeholder="Describe the session work..."
                  className="w-full rounded-lg border border-[#c3c6d2] p-2.5 text-sm focus:border-brand outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-brand-muted block mb-1">Deliverables</label>
                <textarea
                  value={editDeliverables}
                  onChange={(e) => setEditDeliverables(e.target.value)}
                  rows={2}
                  placeholder="What tangible output did this session produce?..."
                  className="w-full rounded-lg border border-[#c3c6d2] p-2.5 text-sm focus:border-brand outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-[#c3c6d2]/30 pt-4">
              <button
                type="button"
                onClick={() => setEditingEntry(null)}
                disabled={updateMutation.isPending}
                className="h-10 rounded-lg border border-[#c3c6d2] px-4 text-sm font-semibold text-brand-navy hover:bg-[#f6f3f4] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
                className="h-10 rounded-lg bg-brand px-5 text-sm font-bold text-white hover:bg-[#1467d6] flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-brand-navy mb-2">Delete Time Entry</h3>
            <p className="text-sm text-brand-muted mb-5 leading-relaxed">
              Are you sure you want to delete this time entry? This action cannot be undone, and the timesheet totals will be updated automatically.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingEntry(null)}
                disabled={deleteMutation.isPending}
                className="h-10 rounded-lg border border-[#c3c6d2] px-4 text-sm font-semibold text-brand-navy hover:bg-[#f6f3f4] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="h-10 rounded-lg bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-700 flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
