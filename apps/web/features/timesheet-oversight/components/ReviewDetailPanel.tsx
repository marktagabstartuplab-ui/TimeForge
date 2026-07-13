"use client";

import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, TrendingUp, BookOpen, MessageSquare, Loader2, RefreshCw, AlertCircle, Ban } from "lucide-react";
import { StatusBadge, timesheetStatusTone } from "@/components/shared/StatusBadge";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { approveTimesheet, rejectTimesheet, requestRevisionTimesheet, type TimesheetDetail } from "../api/timesheet-oversight.service";

interface ReviewDetailPanelProps {
  detail: TimesheetDetail | null;
  loading: boolean;
  onSuccess: () => void;
  onToast: (t: { message: string; tone: "success" | "error" }) => void;
}

function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function ReviewDetailPanel({ detail, loading, onSuccess, onToast }: ReviewDetailPanelProps) {
  const queryClient = useQueryClient();
  const [remark, setRemark] = useState("");

  const approve = useMutation({
    mutationFn: () => approveTimesheet(detail!.id, { expectedVersion: detail!.version, remark: remark.trim() || undefined }),
    onSuccess: () => {
      onToast({ message: "Timesheet approved successfully.", tone: "success" });
      setRemark("");
      onSuccess();
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Approval failed.", tone: "error" }),
  });

  const reject = useMutation({
    mutationFn: () => rejectTimesheet(detail!.id, { expectedVersion: detail!.version, remark: remark.trim() }),
    onSuccess: () => {
      onToast({ message: "Timesheet rejected.", tone: "success" });
      setRemark("");
      onSuccess();
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Rejection failed.", tone: "error" }),
  });

  const requestRevision = useMutation({
    mutationFn: () => requestRevisionTimesheet(detail!.id, { expectedVersion: detail!.version, remark: remark.trim() }),
    onSuccess: () => {
      onToast({ message: "Revision requested from employee.", tone: "success" });
      setRemark("");
      onSuccess();
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Revision request failed.", tone: "error" }),
  });

  const isPendingDecision = approve.isPending || reject.isPending || requestRevision.isPending;

  // Split regular/overtime (8h regular limit per entry's day)
  const stats = useMemo(() => {
    if (!detail) return { total: 0, overtime: 0, regular: 0 };
    const totalMinutes = detail.entries.reduce((acc, curr) => acc + (curr.durationMinutes ?? 0), 0);
    
    // Group entries by day to calculate daily overtime
    const byDay = new Map<string, number>();
    for (const entry of detail.entries) {
      const dateStr = entry.startTime.slice(0, 10);
      byDay.set(dateStr, (byDay.get(dateStr) ?? 0) + (entry.durationMinutes ?? 0));
    }
    
    let overtimeMinutes = 0;
    for (const [_, dayMinutes] of byDay) {
      if (dayMinutes > 8 * 60) {
        overtimeMinutes += dayMinutes - (8 * 60);
      }
    }
    
    return {
      total: totalMinutes / 60,
      overtime: overtimeMinutes / 60,
      regular: (totalMinutes - overtimeMinutes) / 60
    };
  }, [detail]);

  if (loading) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-[16px] border border-[#c3c6d2]/40 bg-white p-6">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="mt-2 text-sm text-brand-muted">Loading timesheet details...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center rounded-[16px] border border-[#c3c6d2]/40 bg-white p-6 text-center">
        <AlertCircle className="h-10 w-10 text-brand-muted/80" />
        <p className="mt-2 text-sm font-semibold text-brand-muted">No Timesheet Selected</p>
        <p className="mt-1 text-xs text-brand-muted/70">Select a pending timesheet from the left panel to review details.</p>
      </div>
    );
  }

  const { label, tone } = timesheetStatusTone(detail.status);
  const name = `${detail.user.firstName} ${detail.user.lastName}`;

  return (
    <div className="flex flex-col gap-5 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      {/* Title / Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#c3c6d2]/20 pb-4">
        <div>
          <h2 className="text-xl font-bold text-brand-navy">{name}</h2>
          <p className="text-xs text-brand-muted">{detail.user.department?.name ?? "No Department"}</p>
        </div>
        <StatusBadge label={label} tone={tone} />
      </div>

      {/* Grid panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Total Hours Card */}
        <div className="flex items-center gap-4 rounded-[12px] border border-[#c3c6d2]/40 bg-brand/5 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-muted">Total Hours Logged</p>
            <p className="text-2xl font-black text-brand-ink">{stats.total.toFixed(1)}h</p>
            <p className="text-[10px] text-brand-muted mt-0.5">{stats.regular.toFixed(1)}h Regular</p>
          </div>
        </div>

        {/* Overtime Card */}
        <div className={`flex items-center gap-4 rounded-[12px] border p-4 ${
          stats.overtime > 0 ? "border-amber-200 bg-amber-50" : "border-[#c3c6d2]/40 bg-slate-50"
        }`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            stats.overtime > 0 ? "bg-amber-100 text-amber-600" : "bg-slate-200 text-slate-500"
          }`}>
            <AlertCircle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-muted">Overtime Hours</p>
            <p className={`text-2xl font-black ${stats.overtime > 0 ? "text-amber-700" : "text-brand-muted"}`}>
              {stats.overtime.toFixed(1)}h
            </p>
            <p className="text-[10px] text-brand-muted mt-0.5">Calculated over 8h/day</p>
          </div>
        </div>
      </div>

      {/* Logged tasks / outputs */}
      <div>
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-muted mb-2">
          <BookOpen className="h-4 w-4" />
          Logged Tasks & Outputs
        </h3>
        <div className="max-h-60 overflow-y-auto border border-[#c3c6d2]/40 rounded-[12px] divide-y divide-[#c3c6d2]/25">
          {detail.entries.length === 0 ? (
            <div className="p-4 text-center text-xs text-brand-muted">No time entries recorded for this period.</div>
          ) : (
            detail.entries.map((entry) => (
              <div key={entry.id} className="p-3 hover:bg-slate-50/50 flex items-start gap-3 justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-brand-ink truncate">{entry.description || "General Work Output"}</p>
                  {entry.deliverables ? (
                    <p className="text-xs text-brand-muted truncate">
                      <span className="font-semibold">Deliverables:</span> {entry.deliverables}
                    </p>
                  ) : null}
                  <p className="text-[10px] text-brand-muted mt-0.5">
                    {new Date(entry.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })} @ {formatTime(entry.startTime)}
                  </p>
                </div>
                <div className="text-xs font-bold text-brand bg-slate-100 px-2 py-0.5 rounded">
                  {formatHours(entry.durationMinutes ?? 0)}h
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Accomplishments/Summary notes if employee submitted any */}
      {detail.summary && (
        <div className="rounded-[12px] border border-brand/10 bg-slate-50/50 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-brand-muted mb-1 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Employee Notes / Accomplishments
          </h4>
          <p className="text-xs text-brand-ink whitespace-pre-wrap leading-relaxed">{detail.summary}</p>
        </div>
      )}

      {/* Approval history log */}
      {detail.approvals.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-brand-muted mb-2 flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Approval Log History
          </h3>
          <div className="border border-[#c3c6d2]/40 rounded-[12px] p-3 flex flex-col gap-2 max-h-32 overflow-y-auto">
            {detail.approvals.map((app) => (
              <div key={app.id} className="text-xs flex flex-col gap-0.5 border-b border-[#c3c6d2]/20 pb-2 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-brand-ink">
                    {app.supervisor.firstName} {app.supervisor.lastName}
                  </span>
                  <span className={`font-bold uppercase tracking-wide px-1.5 py-0.2 rounded text-[9px] ${
                    app.action === "APPROVE" ? "bg-emerald-50 text-emerald-700" :
                    app.action === "REJECT" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                  }`}>
                    {app.action}
                  </span>
                </div>
                {app.remark && <p className="text-brand-muted italic mt-0.5">&ldquo;{app.remark}&rdquo;</p>}
                <span className="text-[10px] text-brand-muted/70">{new Date(app.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coaching & remarks */}
      <div className="flex flex-col gap-1.5 border-t border-[#c3c6d2]/25 pt-4">
        <label htmlFor="approvals-remark" className="text-xs font-bold uppercase tracking-wider text-brand-muted flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4" />
          Add Approval/Rejection/Revision Remarks
        </label>
        <Textarea
          id="approvals-remark"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="Remarks are required when requesting revisions or rejecting a timesheet. Optional for approvals..."
          rows={3}
          disabled={isPendingDecision}
          className="bg-white text-sm"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap justify-end gap-2.5 mt-2">
        <button
          type="button"
          onClick={() => requestRevision.mutate()}
          disabled={isPendingDecision || !remark.trim()}
          className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
        >
          {requestRevision.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Request Revision
        </button>
        <button
          type="button"
          onClick={() => reject.mutate()}
          disabled={isPendingDecision || !remark.trim()}
          className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {reject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Reject
        </button>
        <button
          type="button"
          onClick={() => approve.mutate()}
          disabled={isPendingDecision}
          className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-brand px-6 text-sm font-bold text-white hover:bg-[#1467d6] disabled:opacity-50 transition-colors"
        >
          {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Approve
        </button>
      </div>
    </div>
  );
}
