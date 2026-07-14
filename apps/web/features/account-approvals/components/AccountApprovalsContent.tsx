"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ClipboardList, Eye, Loader2 } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { SearchInput } from "@/components/shared/SearchInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Avatar } from "@/components/shared/Avatar";
import { Toast, type ToastState } from "@/components/shared/Toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { fetchDepartments } from "@/features/auth/api/auth.service";
import { useProfileModalStore } from "@/features/account/store/profile-modal.store";
import { ApiError } from "@/lib/api/client";
import {
  listPendingAccounts,
  approveAccount,
  rejectAccount,
  type PendingAccountRow,
} from "../api/account-approvals.service";

const ROLES = ["EMPLOYEE", "SUPERVISOR", "HR", "FINANCE", "ADMIN"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatRequestedRole(role: PendingAccountRow["requestedRole"]): string {
  if (!role) return "—";
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export function AccountApprovalsContent() {
  const queryClient = useQueryClient();
  const openProfileModal = useProfileModalStore((s) => s.open);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("ALL");
  const [role, setRole] = useState("ALL");
  const [rejectTarget, setRejectTarget] = useState<PendingAccountRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: departments } = useQuery({ queryKey: ["auth", "departments"], queryFn: fetchDepartments });

  const query = {
    q: search || undefined,
    departmentId: departmentId === "ALL" ? undefined : departmentId,
    role: role === "ALL" ? undefined : role,
    limit: 10,
  };

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["account-approvals", "list", query],
    queryFn: ({ pageParam }: { pageParam?: string }) => listPendingAccounts({ ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page.nextCursor ?? undefined,
  });

  const rows = data?.pages.flatMap((p) => p.data) ?? [];
  const total = data?.pages[0]?.page.total ?? rows.length;

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ["account-approvals"] });

  const approveMutation = useMutation({
    mutationFn: (row: PendingAccountRow) => approveAccount(row.id, row.version),
    onSuccess: (_res, row) => {
      setToast({ message: `${row.firstName} ${row.lastName}'s account was approved.`, tone: "success" });
      invalidateAll();
    },
    onError: (err) => setToast({ message: err instanceof ApiError ? err.message : "Approval failed.", tone: "error" }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectAccount(rejectTarget!.id, rejectTarget!.version, rejectReason || undefined),
    onSuccess: () => {
      setToast({ message: `${rejectTarget!.firstName} ${rejectTarget!.lastName}'s registration was rejected.`, tone: "success" });
      setRejectTarget(null);
      setRejectReason("");
      invalidateAll();
    },
    onError: (err) => setToast({ message: err instanceof ApiError ? err.message : "Rejection failed.", tone: "error" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Admin Operations
          </p>
          <h1 className="mt-1 text-2xl font-bold text-brand-navy">Pending Account Approvals</h1>
          <p className="text-sm text-brand-muted">
            Review and authorize incoming registration requests. Verification ensures compliance with security protocols.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-[16px] bg-brand px-6 py-4 text-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <ClipboardList className="h-8 w-8 text-white/80" aria-hidden="true" />
          <div>
            <p className="text-xs text-white/80">Total Pending Requests</p>
            <p className="text-3xl font-bold">{isLoading ? "…" : total}</p>
          </div>
        </div>
      </div>

      <SectionCard title="Filters">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-[1.4] min-w-[200px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Search</label>
            <SearchInput placeholder="Search name or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[170px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Requested Department</label>
            <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? "ALL")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Departments</SelectItem>
                {departments?.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Requested Role</label>
            <Select value={role} onValueChange={(v) => setRole(v ?? "ALL")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Roles</SelectItem>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => { setSearch(""); setDepartmentId("ALL"); setRole("ALL"); }}
          >
            Reset
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Approval Queue">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : isError ? (
          <ErrorState message="Couldn't load pending requests." onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState message="No pending account requests match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#c3c6d2]/50 text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  <th className="pb-2 pr-4">Applicant</th>
                  <th className="pb-2 pr-4">Department</th>
                  <th className="pb-2 pr-4">Job Title</th>
                  <th className="pb-2 pr-4">Requested Role</th>
                  <th className="pb-2 pr-4">Request Date</th>
                  <th className="pb-2 pr-4">Verification</th>
                  <th className="pb-2 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/30">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <Avatar firstName={r.firstName} lastName={r.lastName} size="sm" />
                        <div>
                          <p className="font-medium text-brand-ink">{r.firstName} {r.lastName}</p>
                          <p className="text-xs text-brand-muted">{r.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-brand-muted">{r.department?.name ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-brand-muted">{r.jobTitle ?? "—"}</td>
                    <td className="py-2.5 pr-4">
                      {r.requestedRole ? (
                        <StatusBadge
                          label={formatRequestedRole(r.requestedRole)}
                          tone={r.requestedRole === "INTERN" ? "warning" : "info"}
                        />
                      ) : (
                        <span className="text-brand-muted">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap text-brand-muted">{formatDate(r.createdAt)}</td>
                    <td className="py-2.5 pr-4">
                      {r.emailVerifiedAt ? (
                        <StatusBadge label="New Request" tone="info" />
                      ) : (
                        <StatusBadge label="Verification Pending" tone="warning" />
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openProfileModal(r.id)}
                          aria-label="View profile"
                          className="rounded-md p-1.5 text-brand-muted hover:bg-[#f6f3f4]"
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => approveMutation.mutate(r)}
                          disabled={approveMutation.isPending}
                        >
                          {approveMutation.isPending && approveMutation.variables?.id === r.id ? (
                            <Loader2 className="animate-spin" aria-hidden="true" />
                          ) : null}
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => setRejectTarget(r)}
                        >
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasNextPage ? (
          <Button type="button" variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="self-center">
            {isFetchingNextPage ? "Loading…" : "Load More"}
          </Button>
        ) : null}
      </SectionCard>

      <Dialog open={Boolean(rejectTarget)} onOpenChange={(open) => { if (!open) { setRejectTarget(null); setRejectReason(""); } }}>
        <DialogContent>
          <div className="flex items-start justify-between px-6 pt-6">
            <div>
              <DialogTitle>Reject {rejectTarget?.firstName} {rejectTarget?.lastName}&apos;s Request</DialogTitle>
              <DialogDescription>An optional reason will be included in the notification email.</DialogDescription>
            </div>
            <DialogCloseButton />
          </div>
          <div className="flex flex-col gap-4 px-6 py-5">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)..."
              rows={4}
            />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button type="button" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
                {rejectMutation.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
