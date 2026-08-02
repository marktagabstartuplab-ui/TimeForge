"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ConfirmationDialog } from "@/components/shared/ConfirmationDialog";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCan } from "@/features/auth/rbac";
import { useAuth } from "@/providers/auth-provider";
import { listEmployees } from "@/features/employee-management/api/employee-management.service";
import { ApiError } from "@/lib/api/client";
import { BUG_PRIORITIES, BUG_STATUSES, BUG_SEVERITIES } from "../schemas/bug.schema";
import {
  deleteBug,
  getBug,
  getBugActivity,
  getBugAttachmentUrl,
  updateBug,
  type BugPriority,
  type BugSeverity,
  type BugStatus,
} from "../api/bugs.service";
import { BugPriorityBadge, BugSeverityBadge, BugStatusBadge } from "./StatusBadge";
import { CommentThread } from "./CommentThread";

const UNASSIGNED = "UNASSIGNED";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-brand-ink">{value}</p>
    </div>
  );
}

export function BugDetailContent({ bugId }: { bugId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canTriage = useCan("bug:update");
  const canDelete = useCan("bug:delete");
  const canComment = useCan("bug:comment");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: bug, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["bugs", bugId],
    queryFn: () => getBug(bugId),
  });

  const { data: activity } = useQuery({
    queryKey: ["bugs", bugId, "activity"],
    queryFn: () => getBugActivity(bugId),
  });

  // Assignment picker — only triage-capable users can see or use it, and only
  // they hold user:read, so the request is gated on the same permission.
  const { data: employees } = useQuery({
    queryKey: ["bugs", "assignable-employees"],
    queryFn: () => listEmployees({ status: "ACTIVE", limit: 100 }),
    enabled: canTriage,
  });

  const triageMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateBug>[1]) => updateBug(bugId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bugs"] });
      setToast({ tone: "success", message: "Bug updated." });
    },
    onError: (err) => {
      setToast({
        tone: "error",
        message: err instanceof ApiError ? err.message : "Failed to update the bug.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteBug(bugId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bugs"] });
      router.push("/bugs");
    },
    onError: (err) => {
      setConfirmDelete(false);
      setToast({
        tone: "error",
        message: err instanceof ApiError ? err.message : "Failed to delete the bug.",
      });
    },
  });

  const openAttachment = async (attachmentId: string) => {
    try {
      const url = await getBugAttachmentUrl(bugId, attachmentId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setToast({ tone: "error", message: "Could not open that attachment." });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full rounded-[16px]" />
      </div>
    );
  }

  if (isError || !bug) {
    return (
      <div className="flex flex-col gap-6">
        <ErrorState
          message={error instanceof Error ? error.message : "Failed to load this bug report."}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div>
        <Link
          href="/bugs"
          className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-muted hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to issues
        </Link>
        <PageHeader
          title={bug.title}
          subtitle={`Reported ${formatDateTime(bug.createdAt)}${
            bug.reporter ? ` by ${bug.reporter.firstName} ${bug.reporter.lastName}` : ""
          }`}
          action={
            canDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-2 rounded-[10px] border border-red-300 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </button>
            ) : undefined
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <BugStatusBadge status={bug.status} />
        <BugPriorityBadge priority={bug.priority} />
        <BugSeverityBadge severity={bug.severity} />
        <span className="text-xs text-brand-muted">
          {bug.assignee
            ? `Assigned to ${bug.assignee.firstName} ${bug.assignee.lastName}`
            : "Unassigned"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <SectionCard title="Report">
            <div className="flex flex-col gap-4">
              <Field label="Where It Happens" value={bug.whereItHappens} />
              <Field label="The Issue" value={bug.issue} />
              <Field label="Who Is Affected" value={bug.whoAffected} />
              <Field label="What I See" value={bug.whatISee} />
              <Field label="What I Expected" value={bug.expected} />
              {bug.errorMessage ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">
                    Error Message
                  </p>
                  <pre className="overflow-x-auto rounded-[10px] bg-[#f6f3f4] p-3 text-xs text-brand-ink">
                    {bug.errorMessage}
                  </pre>
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title={`Attachments (${bug.attachments?.length ?? 0})`}>
            {bug.attachments && bug.attachments.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {bug.attachments.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-[#c3c6d2]/60 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-brand-ink">{a.fileName}</span>
                    <button
                      type="button"
                      onClick={() => openAttachment(a.id)}
                      className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-brand hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState variant="empty" message="No files attached." />
            )}
          </SectionCard>

          <CommentThread bugId={bugId} comments={bug.comments ?? []} canComment={canComment} />
        </div>

        <div className="flex flex-col gap-6">
          {canTriage ? (
            <SectionCard title="Triage">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">
                    Status
                  </p>
                  <Select
                    value={bug.status}
                    onValueChange={(v) => triageMutation.mutate({ status: v as BugStatus })}
                  >
                    <SelectTrigger
                      aria-label="Bug status"
                      className="h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUG_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">
                    Priority
                  </p>
                  <Select
                    value={bug.priority}
                    onValueChange={(v) => triageMutation.mutate({ priority: v as BugPriority })}
                  >
                    <SelectTrigger
                      aria-label="Bug priority"
                      className="h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUG_PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">
                    Severity
                  </p>
                  <Select
                    value={bug.severity}
                    onValueChange={(v) => triageMutation.mutate({ severity: v as BugSeverity })}
                  >
                    <SelectTrigger
                      aria-label="Bug severity"
                      className="h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUG_SEVERITIES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">
                    Assigned To
                  </p>
                  <Select
                    value={bug.assignedTo ?? UNASSIGNED}
                    onValueChange={(v) =>
                      triageMutation.mutate({ assignedTo: v === UNASSIGNED ? null : v })
                    }
                  >
                    <SelectTrigger
                      aria-label="Assign bug"
                      className="h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {user ? <SelectItem value={user.id}>Assign to me</SelectItem> : null}
                      {(employees?.data ?? [])
                        .filter((e) => e.id !== user?.id)
                        .map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.firstName} {e.lastName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Activity">
            {activity && activity.length > 0 ? (
              <ol className="flex flex-col gap-3">
                {activity.map((a) => (
                  <li key={a.id} className="border-l-2 border-[#c3c6d2]/60 pl-3">
                    <p className="text-xs font-semibold text-brand-ink">
                      {a.action.replace(/_/g, " ").toLowerCase()}
                      {a.oldValue || a.newValue
                        ? `: ${a.oldValue ?? "—"} → ${a.newValue ?? "—"}`
                        : ""}
                    </p>
                    <p className="text-[11px] text-brand-muted">
                      {a.actor ? `${a.actor.firstName} ${a.actor.lastName} · ` : ""}
                      {formatDateTime(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState variant="empty" message="No activity recorded." />
            )}
          </SectionCard>
        </div>
      </div>

      <ConfirmationDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this bug report?"
        description="The report, its comments, attachments and activity log will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
