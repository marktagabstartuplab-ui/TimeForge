"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, UserCheck, Users, Briefcase, ToggleLeft, ToggleRight } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/shared/Avatar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ApiError } from "@/lib/api/client";
import {
  getDepartmentDetail,
  listDepartmentEmployees,
  updateDepartment,
  type DepartmentDetail,
  type DepartmentEmployee,
} from "../api/org-management.service";

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  EMPLOYEE: "Employee",
  INTERN: "Intern",
  CONTRACTOR: "Contractor",
  PART_TIME: "Part-time",
  FULL_TIME: "Full-time",
};

export function DepartmentDetailContent({ departmentId }: { departmentId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);

  const deptQuery = useQuery({
    queryKey: ["org-management", "department", departmentId],
    queryFn: () => getDepartmentDetail(departmentId),
  });

  const employeesQuery = useQuery({
    queryKey: ["org-management", "department-employees", departmentId],
    queryFn: () => listDepartmentEmployees(departmentId),
    enabled: Boolean(departmentId),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () => {
      const dept = deptQuery.data!;
      return updateDepartment(departmentId, { isActive: !dept.isActive, version: dept.version });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-management", "department", departmentId] });
      queryClient.invalidateQueries({ queryKey: ["org-management", "dashboard"] });
      setToast({ message: `Department ${deptQuery.data?.isActive ? "deactivated" : "activated"}.`, tone: "success" });
    },
    onError: (err) => setToast({ message: err instanceof ApiError ? err.message : "Failed to update status.", tone: "error" }),
  });

  const dept = deptQuery.data;
  const employees = employeesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.push("/admin/departments")}
            className="mb-2 flex items-center gap-1.5 text-sm text-brand-muted hover:text-brand-ink"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Departments
          </button>
          {deptQuery.isLoading ? (
            <Skeleton className="h-8 w-64" />
          ) : dept ? (
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-brand-navy">{dept.name}</h1>
              <StatusBadge
                label={dept.isActive ? "Active" : "Inactive"}
                tone={dept.isActive ? "success" : "neutral"}
              />
            </div>
          ) : null}
          {dept && (
            <p className="text-sm text-brand-muted">
              {dept.manager
                ? `Managed by ${dept.manager.firstName} ${dept.manager.lastName}`
                : "No manager assigned"}
            </p>
          )}
        </div>
        {dept && (
          <Button
            type="button"
            variant={dept.isActive ? "outline" : "default"}
            onClick={() => toggleActiveMutation.mutate()}
            disabled={toggleActiveMutation.isPending}
          >
            {toggleActiveMutation.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {dept.isActive ? (
              <>
                <ToggleRight className="h-4 w-4" aria-hidden="true" />
                Deactivate
              </>
            ) : (
              <>
                <ToggleLeft className="h-4 w-4" aria-hidden="true" />
                Activate
              </>
            )}
          </Button>
        )}
      </div>

      {deptQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : dept ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-4 rounded-[12px] border border-[#c3c6d2]/50 bg-white px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10">
                <Users className="h-5 w-5 text-brand" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-brand-muted">Employees</p>
                <p className="text-2xl font-bold text-brand-navy">{dept.employeeCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-[12px] border border-[#c3c6d2]/50 bg-white px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
                <Briefcase className="h-5 w-5 text-amber-600" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-brand-muted">Interns</p>
                <p className="text-2xl font-bold text-brand-navy">{dept.internCount}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-[12px] border border-[#c3c6d2]/50 bg-white px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
                <UserCheck className="h-5 w-5 text-purple-600" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs text-brand-muted">Total Staff</p>
                <p className="text-2xl font-bold text-brand-navy">{dept.staffCount}</p>
              </div>
            </div>
          </div>

          {/* Assigned Supervisor */}
          <SectionCard title="Assigned Supervisor">
            {dept.manager ? (
              <div className="flex items-center gap-3">
                <Avatar firstName={dept.manager.firstName} lastName={dept.manager.lastName} size="md" />
                <div>
                  <p className="font-medium text-brand-ink">{dept.manager.firstName} {dept.manager.lastName}</p>
                  <p className="text-xs text-brand-muted">Department Head</p>
                </div>
              </div>
            ) : (
              <EmptyState message="No supervisor assigned to this department." />
            )}
          </SectionCard>

          {/* Employee List */}
          <SectionCard title="Department Members">
            {employeesQuery.isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : employees.length === 0 ? (
              <EmptyState message="No employees in this department." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#c3c6d2]/50 text-xs font-semibold uppercase tracking-wide text-brand-muted">
                      <th className="pb-2 pr-4">Name</th>
                      <th className="pb-2 pr-4">Email</th>
                      <th className="pb-2 pr-4">Employment Type</th>
                      <th className="pb-2 pr-4">Job Title</th>
                      <th className="pb-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c3c6d2]/30">
                    {employees.map((emp) => (
                      <tr key={emp.id}>
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <Avatar firstName={emp.firstName} lastName={emp.lastName} size="sm" />
                            <span className="font-medium text-brand-ink">{emp.firstName} {emp.lastName}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-brand-muted">{emp.email}</td>
                        <td className="py-2.5 pr-4 text-brand-muted">{EMPLOYMENT_TYPE_LABELS[emp.employmentType] ?? emp.employmentType}</td>
                        <td className="py-2.5 pr-4 text-brand-muted">{emp.jobTitle ?? "—"}</td>
                        <td className="py-2.5 pr-4">
                          <StatusBadge
                            label={emp.status}
                            tone={emp.status === "ACTIVE" ? "success" : emp.status === "PENDING" ? "warning" : "neutral"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
