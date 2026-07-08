"use client";

import { useQuery } from "@tanstack/react-query";
import { Users, Mail, ShieldCheck } from "lucide-react";
import { listEmployees, getPermissionMatrix } from "../api/employee-management.service";

export function EmployeeStatsCards({ isAdmin }: { isAdmin: boolean }) {
  const { data: totalPage, isLoading: totalLoading } = useQuery({
    queryKey: ["employee-management", "employees", "stats-total"],
    queryFn: () => listEmployees({ limit: 1 }),
  });
  const { data: invitedPage, isLoading: invitedLoading } = useQuery({
    queryKey: ["employee-management", "employees", "stats-invited"],
    queryFn: () => listEmployees({ limit: 1, status: "INVITED" }),
  });
  const { data: matrix, isLoading: matrixLoading } = useQuery({
    queryKey: ["employee-management", "permission-matrix"],
    queryFn: getPermissionMatrix,
    enabled: isAdmin,
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <Users className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <p className="mt-2 text-base text-brand-muted">Total Employees</p>
        <p className="text-2xl font-bold text-brand-ink">
          {totalLoading ? "…" : (totalPage?.page.total ?? totalPage?.data.length ?? 0).toLocaleString()}
        </p>
      </div>

      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <Mail className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <p className="mt-2 text-base text-brand-muted">Pending Invites</p>
        <p className="text-2xl font-bold text-brand-ink">
          {invitedLoading ? "…" : (invitedPage?.page.total ?? invitedPage?.data.length ?? 0).toLocaleString()}
        </p>
      </div>

      {isAdmin ? (
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <ShieldCheck className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
          <p className="mt-2 text-base text-brand-muted">Global Roles</p>
          <p className="text-2xl font-bold text-brand-ink">{matrixLoading ? "…" : matrix?.roles.length ?? 0}</p>
        </div>
      ) : null}
    </div>
  );
}
