"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, CalendarDays, Plus, Trash2, Loader2, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { useCan } from "@/features/auth/rbac";
import {
  getHolidays,
  createHoliday,
  removeHoliday,
  type Holiday,
  type HolidayType,
} from "../api/holidays.service";

export function HolidayCalendarContent() {
  const queryClient = useQueryClient();
  const canWrite = useCan("holiday:write");
  const [toast, setToast] = useState<ToastState | null>(null);

  // Form states for adding a holiday
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<HolidayType>("REGULAR");
  const [recurring, setRecurring] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: holidays = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["holidays"],
    queryFn: getHolidays,
  });

  const createMutation = useMutation({
    mutationFn: createHoliday,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      setToast({ message: "Holiday added successfully.", tone: "success" });
      setShowAddModal(false);
      setName("");
      setDate("");
      setType("REGULAR");
      setRecurring(false);
    },
    onError: (err: any) => {
      setToast({ message: err?.response?.data?.message || err?.message || "Failed to add holiday.", tone: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => removeHoliday(id, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      setToast({ message: "Holiday deleted.", tone: "success" });
      setDeletingId(null);
    },
    onError: (err: any) => {
      setToast({ message: err?.response?.data?.message || err?.message || "Failed to delete holiday.", tone: "error" });
      setDeletingId(null);
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !date) {
      setToast({ message: "Please provide a name and date.", tone: "error" });
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      date,
      type,
      recurring,
    });
  };

  const columns: DataTableColumn<Holiday>[] = [
    {
      key: "date",
      header: "Date",
      render: (h) => (
        <span className="font-semibold text-brand-navy">
          {new Date(h.date).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })}
        </span>
      ),
    },
    {
      key: "name",
      header: "Holiday Name",
      render: (h) => <span className="font-bold text-brand-navy">{h.name}</span>,
    },
    {
      key: "type",
      header: "Classification & Premium",
      render: (h) => (
        <div className="flex items-center gap-2">
          {h.type === "REGULAR" ? (
            <StatusBadge label="Regular Holiday (100% Premium)" tone="info" className="bg-blue-50 text-blue-700 border-blue-200" />
          ) : (
            <StatusBadge label="Special Non-Working (30% Premium)" tone="warning" className="bg-amber-50 text-amber-700 border-amber-200" />
          )}
        </div>
      ),
    },
    {
      key: "recurring",
      header: "Recurring",
      render: (h) => (
        <span className="text-xs text-brand-muted">
          {h.recurring ? "Annual (Every Year)" : "One-Time"}
        </span>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "Actions",
            className: "text-right",
            render: (h: Holiday) => (
              <Button
                variant="ghost"
                size="sm"
                disabled={deleteMutation.isPending && deletingId === h.id}
                onClick={() => {
                  setDeletingId(h.id);
                  deleteMutation.mutate({ id: h.id, version: h.version });
                }}
                className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                title="Delete holiday"
              >
                {deleteMutation.isPending && deletingId === h.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <PageHeader
        title="Holiday Calendar"
        subtitle="Manage Philippine national & special holidays. The timesheet and payroll engine automatically applies mandated premiums (Regular: 100%, Special Non-Working: 30%)."
        action={
          canWrite ? (
            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-[#0052cc] hover:bg-[#004bb3] text-white flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Holiday
            </Button>
          ) : null
        }
      />

      {/* Info Banner */}
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-full flex items-center justify-center bg-blue-50 text-[#0052cc] shrink-0">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-brand-navy">Philippine Labor Code Premium Rules</h2>
            <p className="text-xs text-brand-muted mt-1 leading-relaxed">
              • <strong className="text-brand-navy">Regular Holidays:</strong> Work performed is paid an additional <strong className="text-blue-700">100% premium</strong> (200% rate total). Unworked regular holidays are paid at 100%.<br />
              • <strong className="text-brand-navy">Special Non-Working Holidays:</strong> Work performed is paid an additional <strong className="text-amber-700">30% premium</strong> (130% rate total).<br />
              • <strong className="text-brand-navy">Night Shift Differential (NSD):</strong> Work between 10:00 PM and 6:00 AM automatically receives a <strong className="text-emerald-700">10% premium</strong>.<br />
              • <strong className="text-brand-navy">Rest Day Work:</strong> Work on employee scheduled day off automatically receives a <strong className="text-purple-700">30% premium</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Holidays Table */}
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <DataTable
          aria-label="Holiday Calendar"
          columns={columns}
          rows={holidays}
          rowKey={(h) => h.id}
          emptyState={
            <EmptyState
              message={
                isLoading
                  ? "Loading holiday calendar..."
                  : isError
                  ? "Could not load holidays."
                  : "No holidays configured yet. Click 'Add Holiday' to populate the calendar."
              }
            />
          }
        />
      </div>

      {/* Add Holiday Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-brand-navy mb-4">Add Holiday</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-brand-navy block mb-1">
                  Holiday Name
                </label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. Independence Day"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-brand-navy block mb-1">
                  Date
                </label>
                <Input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-brand-navy block mb-1">
                  Holiday Classification
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as HolidayType)}
                  className="w-full h-10 rounded-lg border border-[#c3c6d2] px-3 text-sm focus:border-[#0052cc] outline-none bg-white"
                >
                  <option value="REGULAR">Regular Holiday (100% Premium)</option>
                  <option value="SPECIAL_NON_WORKING">Special Non-Working Holiday (30% Premium)</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="recurring-checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#0052cc] focus:ring-[#0052cc]"
                />
                <label htmlFor="recurring-checkbox" className="text-xs font-medium text-brand-navy cursor-pointer">
                  Recurring Annual Holiday (Repeats Every Year)
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-[#c3c6d2]/30 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-[#0052cc] hover:bg-[#004bb3] text-white flex items-center gap-1.5"
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Holiday
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
