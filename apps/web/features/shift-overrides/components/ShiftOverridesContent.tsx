"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Loader2, ShieldAlert, XCircle } from "lucide-react";
import {
  decideShiftOverride,
  listShiftViolations,
  type ShiftLimitViolation,
} from "@/features/time-tracking/api/shift-limits.service";
import { ApiError } from "@/lib/api/client";
import { formatClockTime } from "@/lib/time";
import { cn } from "@/lib/utils";

function employeeName(v: ShiftLimitViolation): string {
  const first = v.employee?.firstName ?? "";
  const last = v.employee?.lastName ?? "";
  const full = `${first} ${last}`.trim();
  return full || v.employee?.email || "Unknown employee";
}

function hoursLabel(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const TYPE_LABEL: Record<ShiftLimitViolation["violationType"], string> = {
  REACHED_LIMIT: "Reached limit",
  AUTO_CLOCKED_OUT: "Auto clocked out",
  MANUAL_OVERRIDE: "Extension request",
};

/**
 * Supervisor view for FEAT-2: decide pending extension requests, and read the
 * shift-limit audit trail for the team. Scoping is enforced server-side —
 * supervisors see their own direct reports, HR/Admin see the whole org.
 */
export function ShiftOverridesContent() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const { data: pending, isLoading: pendingLoading } = useQuery({
    queryKey: ["shift-violations", "pending"],
    queryFn: () =>
      listShiftViolations({ violationType: "MANUAL_OVERRIDE", supervisorAction: "NO_ACTION" }),
    refetchInterval: 30_000,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["shift-violations", "history"],
    queryFn: () => listShiftViolations({ pageSize: 25 }),
  });

  const decide = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      decideShiftOverride(id, { approved }),
    onMutate: ({ id }) => {
      setError(null);
      setActingId(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-violations"] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Could not record your decision"),
    onSettled: () => setActingId(null),
  });

  const requests = pending?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-brand-ink">Shift Overrides</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Approve or deny extension requests, and review shift-limit violations for your team.
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-[8px] bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {/* Pending requests */}
      <section className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[1px] text-brand-muted">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          Pending requests
          {requests.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
              {requests.length}
            </span>
          ) : null}
        </h2>

        {pendingLoading ? (
          <p className="mt-4 text-sm text-brand-muted">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="mt-4 rounded-[10px] bg-[#f6f3f4] px-4 py-3 text-sm text-brand-muted">
            No extension requests are waiting on you.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {requests.map((v) => (
              <li
                key={v.id}
                className="flex flex-col gap-3 rounded-[10px] border border-[#c3c6d2]/50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-brand-ink">{employeeName(v)}</p>
                  <p className="mt-0.5 text-xs text-brand-muted">
                    Requests <strong>{hoursLabel(v.requestedExtensionMinutes ?? 0)}</strong> extra
                    after {hoursLabel(v.minutesWorkedAtViolation)} clocked in
                    {v.workSession ? ` (since ${formatClockTime(v.workSession.clockIn)})` : ""}.
                  </p>
                  {v.supervisorNote ? (
                    <p className="mt-1 text-xs italic text-brand-muted">
                      &ldquo;{v.supervisorNote}&rdquo;
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={decide.isPending && actingId === v.id}
                    onClick={() => decide.mutate({ id: v.id, approved: false })}
                    className="flex h-10 items-center gap-1.5 rounded-[8px] border border-[#c3c6d2]/60 bg-white px-4 text-sm font-bold text-brand-navy transition-colors hover:bg-[#f6f3f4] disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    Deny
                  </button>
                  <button
                    type="button"
                    disabled={decide.isPending && actingId === v.id}
                    onClick={() => decide.mutate({ id: v.id, approved: true })}
                    className="flex h-10 items-center gap-1.5 rounded-[8px] bg-brand px-4 text-sm font-bold text-white transition-colors hover:bg-[#1467d6] disabled:opacity-60"
                  >
                    {decide.isPending && actingId === v.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    Approve
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Audit trail */}
      <section className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[1px] text-brand-muted">
          <Clock3 className="h-4 w-4" aria-hidden="true" />
          Recent shift-limit activity
        </h2>

        {historyLoading ? (
          <p className="mt-4 text-sm text-brand-muted">Loading…</p>
        ) : (history?.data.length ?? 0) === 0 ? (
          <p className="mt-4 rounded-[10px] bg-[#f6f3f4] px-4 py-3 text-sm text-brand-muted">
            No shift-limit events recorded yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">
                  <th className="pb-2">Employee</th>
                  <th className="pb-2">Event</th>
                  <th className="pb-2">At</th>
                  <th className="pb-2">Elapsed</th>
                  <th className="pb-2">Decision</th>
                </tr>
              </thead>
              <tbody>
                {history!.data.map((v) => (
                  <tr key={v.id} className="border-t border-[#c3c6d2]/40">
                    <td className="py-2.5 text-brand-ink">{employeeName(v)}</td>
                    <td className="py-2.5 text-brand-muted">{TYPE_LABEL[v.violationType]}</td>
                    <td className="py-2.5 text-brand-muted">{formatClockTime(v.violationAt)}</td>
                    <td className="py-2.5 tabular-nums text-brand-muted">
                      {hoursLabel(v.minutesWorkedAtViolation)}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-bold",
                          v.supervisorAction === "APPROVED" && "bg-green-100 text-green-700",
                          v.supervisorAction === "DENIED" && "bg-red-100 text-red-700",
                          v.supervisorAction === "NO_ACTION" && "bg-[#eef0f4] text-brand-muted",
                        )}
                      >
                        {v.supervisorAction === "NO_ACTION" ? "—" : v.supervisorAction}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
