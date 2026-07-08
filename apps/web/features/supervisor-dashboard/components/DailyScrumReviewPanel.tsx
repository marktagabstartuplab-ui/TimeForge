"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Loader2, Send, TriangleAlert } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Avatar } from "@/components/shared/Avatar";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { useProfileModalStore } from "@/features/account/store/profile-modal.store";
import { commentOnScrumEntry } from "@/features/scrum/api/scrum.service";
import { getDailyScrums } from "../api/supervisor-dashboard.service";
import type { ScrumReviewRow } from "../api/supervisor-dashboard.service";
import type { ToastState } from "@/components/shared/Toast";

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function FeedbackRow({ row, onToast }: { row: ScrumReviewRow; onToast: (t: ToastState) => void }) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState(row.supervisorNote ?? "");
  const [firstName, ...rest] = row.employeeName.split(" ");
  const openProfileModal = useProfileModalStore((s) => s.open);

  const send = useMutation({
    mutationFn: () => commentOnScrumEntry(row.id, comment.trim(), row.version),
    onSuccess: () => {
      onToast({ message: "Feedback sent.", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["supervisor"] });
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Could not send feedback.", tone: "error" }),
  });

  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-[#c3c6d2]/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Avatar firstName={firstName} lastName={rest.join(" ")} size="sm" />
          <div>
            <p className="text-sm font-bold text-brand-ink">{row.employeeName}</p>
            <p className="text-xs text-brand-muted">Submitted {formatTime(row.submittedAt)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openProfileModal(row.userId)}
          className="flex shrink-0 items-center gap-1.5 rounded-[8px] border border-[#c3c6d2]/60 px-2.5 py-1.5 text-xs font-bold text-brand-ink hover:bg-[#f6f3f4]"
        >
          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
          Coach
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Yesterday</p>
          <p className="mt-1 text-sm text-brand-ink">{row.yesterday}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Today</p>
          <p className="mt-1 text-sm text-brand-ink">{row.today}</p>
        </div>
      </div>

      {row.blockers ? (
        <div className="flex items-start gap-2 rounded-[8px] bg-red-50 px-3 py-2 text-sm text-red-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {row.blockers}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Leave feedback for this employee…"
          rows={1}
          className="min-h-9 flex-1"
        />
        <button
          type="button"
          onClick={() => send.mutate()}
          disabled={send.isPending || comment.trim().length === 0}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] bg-brand px-3 text-sm font-bold text-white hover:bg-[#1467d6] disabled:opacity-50"
        >
          {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send
        </button>
      </div>
    </div>
  );
}

export function DailyScrumReviewPanel({ onToast }: { onToast: (t: ToastState) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["supervisor", "daily-scrums"],
    queryFn: () => getDailyScrums(10),
    refetchInterval: 60_000,
  });
  const rows = data ?? [];

  return (
    <SectionCard title="Daily Scrum Review">
      {isLoading ? (
        <p className="text-sm text-brand-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState message="No scrum submissions from your team yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <FeedbackRow key={row.id} row={row} onToast={onToast} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
