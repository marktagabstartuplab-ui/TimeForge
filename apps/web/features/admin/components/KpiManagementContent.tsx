"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target, Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/SectionCard";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  listKpiTemplates,
  createKpiTemplate,
  updateKpiTemplate,
  deleteKpiTemplate,
  type KpiTemplateRow,
  type KpiTemplatePayload,
  type KpiMetricType,
  type KpiPeriod,
} from "../api/kpi-management.service";
import { ApiError } from "@/lib/api/client";

const METRIC_TYPES: KpiMetricType[] = ["COUNT", "HOURS", "PERCENT", "CURRENCY", "CUSTOM"];
const PERIODS: KpiPeriod[] = ["DAILY", "WEEKLY", "MONTHLY", "PAYROLL_PERIOD"];

const EMPTY_FORM: KpiTemplatePayload = {
  name: "",
  description: "",
  metricType: "COUNT",
  period: "MONTHLY",
  targetValue: 0,
  unit: "",
  formula: "",
  displayFormat: "",
};

export function KpiManagementContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<KpiTemplateRow | null>(null);
  const [form, setForm] = useState<KpiTemplatePayload>(EMPTY_FORM);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["admin", "kpi-templates"],
    queryFn: listKpiTemplates,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "kpi-templates"] });

  const createMutation = useMutation({
    mutationFn: createKpiTemplate,
    onSuccess: () => {
      setToast({ message: "KPI metric created.", tone: "success" });
      setModalOpen(false);
      invalidate();
    },
    onError: (err: any) => setToast({ message: err instanceof ApiError ? err.message : "Failed to create KPI metric.", tone: "error" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<KpiTemplatePayload> & { version: number } }) =>
      updateKpiTemplate(id, payload),
    onSuccess: () => {
      setToast({ message: "KPI metric updated.", tone: "success" });
      setModalOpen(false);
      invalidate();
    },
    onError: (err: any) => setToast({ message: err instanceof ApiError ? err.message : "Failed to update KPI metric.", tone: "error" }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => deleteKpiTemplate(id, version),
    onSuccess: () => {
      setToast({ message: "KPI metric deleted.", tone: "success" });
      invalidate();
    },
    onError: (err: any) => setToast({ message: err instanceof ApiError ? err.message : "Failed to delete KPI metric.", tone: "error" }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (tpl: KpiTemplateRow) => {
    setEditing(tpl);
    setForm({
      name: tpl.name,
      description: tpl.description ?? "",
      metricType: tpl.metricType,
      period: tpl.period,
      targetValue: Number(tpl.targetValue),
      unit: tpl.unit ?? "",
      formula: tpl.formula ?? "",
      displayFormat: tpl.displayFormat ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = () => {
    const payload: KpiTemplatePayload = {
      ...form,
      unit: form.metricType === "CUSTOM" ? form.unit || undefined : undefined,
      formula: form.formula || undefined,
      displayFormat: form.displayFormat || undefined,
      description: form.description || undefined,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: { ...payload, version: editing.version } });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isCustom = form.metricType === "CUSTOM";
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">KPI Management</h1>
          <p className="text-sm text-brand-muted">
            Define KPI metrics — including fully custom metric types — used across Timesheets, Payroll, Attendance, Daily Scrum, and Approvals.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-brand hover:bg-brand/90 text-white font-bold text-xs">
          <Plus className="h-4 w-4 mr-1" /> New KPI Metric
        </Button>
      </div>

      <SectionCard title="KPI Metric Templates">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : templates.length === 0 ? (
          <EmptyState message="No KPI templates yet — create one to start tracking a metric." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                  <th className="py-3 px-3">Metric Name</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Unit</th>
                  <th className="py-3 px-3">Period</th>
                  <th className="py-3 px-3">Target</th>
                  <th className="py-3 px-3">Formula</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/25">
                {templates.map((tpl) => (
                  <tr key={tpl.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-brand shrink-0" />
                        <div>
                          <p className="font-semibold text-brand-navy">{tpl.name}</p>
                          {tpl.description ? <p className="text-xs text-brand-muted">{tpl.description}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge label={tpl.metricType} tone={tpl.metricType === "CUSTOM" ? "brand" : "neutral"} />
                    </td>
                    <td className="py-3 px-3 text-brand-muted">{tpl.unit || "—"}</td>
                    <td className="py-3 px-3 text-brand-muted">{tpl.period}</td>
                    <td className="py-3 px-3 font-semibold text-brand-navy">{String(tpl.targetValue)}</td>
                    <td className="py-3 px-3 max-w-[220px] truncate text-xs text-brand-muted">{tpl.formula || "—"}</td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(tpl)}
                          className="rounded-full p-1.5 text-brand-muted hover:text-brand hover:bg-[#f6f3f4]"
                          aria-label={`Edit ${tpl.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate({ id: tpl.id, version: tpl.version })}
                          disabled={deleteMutation.isPending}
                          className="rounded-full p-1.5 text-brand-muted hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                          aria-label={`Delete ${tpl.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-lg w-full border border-[#c3c6d2] shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-6">
              <h3 className="text-lg font-bold text-brand-navy">{editing ? "Edit KPI Metric" : "New KPI Metric"}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-brand-muted hover:text-brand-navy">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-brand-muted uppercase tracking-wide">Metric Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-[#c3c6d2] px-3 text-sm outline-none focus:border-brand"
                  placeholder="e.g. Support Tickets Resolved"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-brand-muted uppercase tracking-wide">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-[#c3c6d2] px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-brand-muted uppercase tracking-wide">Metric Type</label>
                  <select
                    value={form.metricType}
                    onChange={(e) => setForm((f) => ({ ...f, metricType: e.target.value as KpiMetricType }))}
                    className="h-10 w-full rounded-lg border border-[#c3c6d2] px-2 text-sm"
                  >
                    {METRIC_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-brand-muted uppercase tracking-wide">Period</label>
                  <select
                    value={form.period}
                    onChange={(e) => setForm((f) => ({ ...f, period: e.target.value as KpiPeriod }))}
                    className="h-10 w-full rounded-lg border border-[#c3c6d2] px-2 text-sm"
                  >
                    {PERIODS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-brand-muted uppercase tracking-wide">Target Value</label>
                <input
                  type="number"
                  min={0}
                  value={form.targetValue}
                  onChange={(e) => setForm((f) => ({ ...f, targetValue: Number(e.target.value) }))}
                  className="h-10 w-full rounded-lg border border-[#c3c6d2] px-3 text-sm outline-none focus:border-brand"
                />
              </div>

              {isCustom ? (
                <div className="space-y-4 rounded-lg border border-brand/20 bg-brand-cyan/5 p-4">
                  <p className="text-xs font-bold text-brand uppercase tracking-wide">Custom Metric Definition</p>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-brand-muted uppercase tracking-wide">Unit</label>
                    <input
                      type="text"
                      value={form.unit}
                      onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                      placeholder="e.g. tickets, ₱, NPS points"
                      className="h-10 w-full rounded-lg border border-[#c3c6d2] px-3 text-sm outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-brand-muted uppercase tracking-wide">Formula (optional)</label>
                    <input
                      type="text"
                      value={form.formula}
                      onChange={(e) => setForm((f) => ({ ...f, formula: e.target.value }))}
                      placeholder="e.g. resolved_tickets / total_tickets * 100"
                      className="h-10 w-full rounded-lg border border-[#c3c6d2] px-3 text-sm outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-brand-muted uppercase tracking-wide">Display Format (optional)</label>
                    <input
                      type="text"
                      value={form.displayFormat}
                      onChange={(e) => setForm((f) => ({ ...f, displayFormat: e.target.value }))}
                      placeholder="e.g. percent, currency, number"
                      className="h-10 w-full rounded-lg border border-[#c3c6d2] px-3 text-sm outline-none focus:border-brand"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#c3c6d2]/40 px-6 py-4">
              <Button variant="outline" onClick={() => setModalOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSaving || !form.name.trim() || (isCustom && !form.unit?.trim())}
                className="bg-brand hover:bg-brand/90 text-white font-bold text-xs"
              >
                {isSaving ? "Saving..." : editing ? "Save Changes" : "Create Metric"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
