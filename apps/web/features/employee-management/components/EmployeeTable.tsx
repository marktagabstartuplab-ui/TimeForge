"use client";

import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Upload, UserX, ChevronDown } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { SearchInput } from "@/components/shared/SearchInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmationDialog } from "@/components/shared/ConfirmationDialog";
import { fetchDepartments } from "@/features/auth/api/auth.service";
import { useProfileModalStore } from "@/features/account/store/profile-modal.store";
import { ApiError } from "@/lib/api/client";
import {
  listEmployees,
  updateEmployee,
  exportEmployeesCsv,
  exportEmployeesPdf,
  type EmployeeRow,
} from "../api/employee-management.service";
import { ImportEmployeesModal } from "./ImportEmployeesModal";
import type { ToastState } from "@/components/shared/Toast";

const STATUSES = ["PENDING", "INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED", "REJECTED"];
const ROLES = ["EMPLOYEE", "SUPERVISOR", "HR", "FINANCE", "ADMIN"];
const TABS = ["ALL", "INVITED", "DEACTIVATED"] as const;

function statusTone(status: string): { label: string; tone: BadgeTone } {
  switch (status) {
    case "ACTIVE":
      return { label: "Active", tone: "success" };
    case "INVITED":
      return { label: "Invited", tone: "info" };
    case "PENDING":
      return { label: "Pending", tone: "warning" };
    case "SUSPENDED":
      return { label: "Suspended", tone: "danger" };
    case "DEACTIVATED":
      return { label: "Deactivated", tone: "neutral" };
    case "REJECTED":
      return { label: "Rejected", tone: "danger" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function EmployeeTable({ isAdmin, onToast }: { isAdmin: boolean; onToast: (t: ToastState) => void }) {
  const queryClient = useQueryClient();
  const openProfileModal = useProfileModalStore((s) => s.open);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("ALL");
  const [role, setRole] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);

  const { data: departments } = useQuery({ queryKey: ["auth", "departments"], queryFn: fetchDepartments });

  const query = {
    q: search || undefined,
    status: status === "ALL" ? undefined : status,
    departmentId: departmentId === "ALL" ? undefined : departmentId,
    role: role === "ALL" ? undefined : role,
    limit: 10,
  };

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["employee-management", "employees", query],
    queryFn: ({ pageParam }: { pageParam?: string }) => listEmployees({ ...query, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.page.nextCursor ?? undefined,
  });

  const rows = data?.pages.flatMap((p) => p.data) ?? [];
  const deactivatable = rows.filter((r) => r.status !== "DEACTIVATED");
  const tabValue = (TABS as readonly string[]).includes(status) ? status : "ALL";

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["employee-management"] });
    setSelected(new Set());
  };

  const deactivateSelected = useMutation({
    mutationFn: async () => {
      const targets = rows.filter((r) => selected.has(r.id));
      return Promise.allSettled(
        targets.map((r) => updateEmployee(r.id, { status: "DEACTIVATED", version: r.version })),
      );
    },
    onSuccess: (results) => {
      const failed = results.filter((r) => r.status === "rejected").length;
      onToast(
        failed > 0
          ? { message: `Deactivated ${results.length - failed}, ${failed} failed.`, tone: "error" }
          : { message: `Deactivated ${results.length} employee(s).`, tone: "success" },
      );
      setDeactivateConfirmOpen(false);
      invalidateAll();
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Bulk deactivate failed.", tone: "error" }),
  });

  const toggleSelectAll = () => {
    if (selected.size === deactivatable.length && deactivatable.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(deactivatable.map((r) => r.id)));
    }
  };

  function onRowClick(employee: EmployeeRow) {
    openProfileModal(employee.id);
  }

  return (
    <>
      <SectionCard
        title="Employee Directory"
        action={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" variant="outline" size="sm">
                    Bulk Actions
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void exportEmployeesCsv(query)}>
                  <Download aria-hidden="true" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportEmployeesPdf(query)}>
                  <FileText aria-hidden="true" />
                  Export PDF
                </DropdownMenuItem>
                {isAdmin ? (
                  <>
                    <DropdownMenuItem onClick={() => setImportOpen(true)}>
                      <Upload aria-hidden="true" />
                      Import Employees
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDeactivateConfirmOpen(true)}
                      disabled={selected.size === 0}
                    >
                      <UserX aria-hidden="true" />
                      Deactivate Selected ({selected.size})
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        <Tabs value={tabValue} onValueChange={(v) => setStatus((v as string) ?? "ALL")}>
          <TabsList>
            <TabsTab value="ALL">All Users</TabsTab>
            <TabsTab value="INVITED">Pending Invites</TabsTab>
            <TabsTab value="DEACTIVATED">Deactivated</TabsTab>
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:flex-wrap">
          <div className="flex-[1.4] min-w-[200px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Search</label>
            <SearchInput placeholder="Search name or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[170px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Department</label>
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
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Role</label>
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
          <div className="flex-1 min-w-[150px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v ?? "ALL")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{statusTone(s).label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : isError ? (
          <ErrorState message="Couldn't load employees." onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState message="No employees match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#c3c6d2]/50 text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  {isAdmin ? (
                    <th className="w-8 pb-2">
                      <Checkbox
                        checked={deactivatable.length > 0 && selected.size === deactivatable.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                  ) : null}
                  <th className="pb-2 pr-4">Name &amp; Identification</th>
                  <th className="pb-2 pr-4">Role</th>
                  <th className="pb-2 pr-4">Department</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/30">
                {rows.map((r) => {
                  const { label, tone } = statusTone(r.status);
                  const roleName = r.roles[0]?.role.name ?? "—";
                  return (
                    <tr key={r.id} className="cursor-pointer hover:bg-[#f6f3f4]/60" onClick={() => onRowClick(r)}>
                      {isAdmin ? (
                        <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
                          {r.status !== "DEACTIVATED" ? (
                            <Checkbox
                              checked={selected.has(r.id)}
                              onCheckedChange={(checked) => {
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(r.id);
                                  else next.delete(r.id);
                                  return next;
                                });
                              }}
                            />
                          ) : null}
                        </td>
                      ) : null}
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <Avatar firstName={r.firstName} lastName={r.lastName} imageUrl={r.avatarUrl} size="sm" />
                          <div>
                            <p className="font-medium text-brand-ink">{r.firstName} {r.lastName}</p>
                            <p className="text-xs text-brand-muted">{r.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4"><StatusBadge label={roleName} tone="info" /></td>
                      <td className="py-2.5 pr-4 text-brand-muted">{r.department?.name ?? "—"}</td>
                      <td className="py-2.5"><StatusBadge label={label} tone={tone} /></td>
                    </tr>
                  );
                })}
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

      <ImportEmployeesModal open={importOpen} onOpenChange={setImportOpen} onToast={onToast} />

      <ConfirmationDialog
        open={deactivateConfirmOpen}
        onOpenChange={setDeactivateConfirmOpen}
        title={`Deactivate ${selected.size} employee${selected.size === 1 ? "" : "s"}?`}
        description="Deactivated employees lose access to sign in. This can be reversed later by re-activating their account."
        confirmLabel="Deactivate"
        destructive
        pending={deactivateSelected.isPending}
        onConfirm={() => deactivateSelected.mutate()}
      />
    </>
  );
}
