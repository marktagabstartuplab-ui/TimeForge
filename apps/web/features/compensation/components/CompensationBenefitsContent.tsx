"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Gift, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { useCan } from "@/features/auth/rbac";
import { listEmployees } from "@/features/employee-management/api/employee-management.service";
import {
  assignDeMinimis,
  getDeMinimisCatalog,
  getThirteenthMonthTracker,
  listDeMinimis,
  removeDeMinimis,
  type DeMinimisType,
} from "../api/compensation.service";

const peso = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Tab = "THIRTEENTH" | "DE_MINIMIS";

export function CompensationBenefitsContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [tab, setTab] = useState<Tab>("THIRTEENTH");
  const [year, setYear] = useState(new Date().getFullYear());

  const canManage = useCan("compensation:manage");

  const [benefitEmployeeId, setBenefitEmployeeId] = useState("");
  const [benefitType, setBenefitType] = useState<DeMinimisType | "">("");
  const [benefitAmount, setBenefitAmount] = useState("");

  const { data: employeePage } = useQuery({
    queryKey: ["employees", "compensation-picker"],
    queryFn: () => listEmployees({ limit: 100 }),
  });
  const employees = useMemo(() => employeePage?.data ?? [], [employeePage]);

  const { data: catalog } = useQuery({
    queryKey: ["compensation", "de-minimis-catalog"],
    queryFn: getDeMinimisCatalog,
  });

  const {
    data: tracker,
    isLoading: trackerLoading,
    isError: trackerError,
    refetch: refetchTracker,
  } = useQuery({
    queryKey: ["compensation", "thirteenth-month", year],
    queryFn: () => getThirteenthMonthTracker({ year }),
  });

  const {
    data: benefits,
    isLoading: benefitsLoading,
    refetch: refetchBenefits,
  } = useQuery({
    queryKey: ["compensation", "de-minimis"],
    queryFn: () => listDeMinimis(),
  });

  const selectedRule = catalog?.find((r) => r.type === benefitType);

  const assignMutation = useMutation({
    mutationFn: assignDeMinimis,
    onSuccess: (result) => {
      setToast({
        message: result.wasCapped
          ? `Assigned, but capped to the BIR ceiling of ${peso(Number(result.monthlyAmount))} per month. The excess is taxable compensation.`
          : "De minimis benefit assigned.",
        tone: result.wasCapped ? "info" : "success",
      });
      setBenefitAmount("");
      queryClient.invalidateQueries({ queryKey: ["compensation", "de-minimis"] });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Failed to assign the benefit.", tone: "error" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeDeMinimis,
    onSuccess: () => {
      setToast({ message: "De minimis benefit revoked.", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["compensation", "de-minimis"] });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Failed to revoke the benefit.", tone: "error" });
    },
  });

  const years = [0, 1, 2].map((offset) => new Date().getFullYear() - offset);

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div>
        <h1 className="text-2xl font-bold text-brand-navy">Compensation & Benefits</h1>
        <p className="text-sm text-brand-muted">
          13th-month pay accrual and non-taxable de minimis allowances, capped to BIR ceilings.
        </p>
      </div>

      <div className="flex gap-2 border-b border-[#c3c6d2]/40">
        {(
          [
            { key: "THIRTEENTH" as const, label: "13th-Month Tracker", icon: CalendarRange },
            { key: "DE_MINIMIS" as const, label: "De Minimis Benefits", icon: Gift },
          ]
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key
                ? "border-b-2 border-brand text-brand-navy"
                : "text-brand-muted hover:text-brand-navy"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "THIRTEENTH" ? (
        <SectionCard
          title={`Basic Salary Accrual — Jan 1 to Dec 31, ${year}`}
          action={
            <div className="flex items-center gap-2">
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v ?? year))}>
                <SelectTrigger className="h-9 w-28 rounded-[8px] border-[#c3c6d2] bg-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => refetchTracker()} className="h-9 text-xs">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          }
        >
          {trackerLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : trackerError ? (
            <EmptyState message="Could not load the 13th-month tracker." />
          ) : !tracker || tracker.employees.length === 0 ? (
            <EmptyState message={`No generated payroll found for ${year}, so there is nothing to accrue yet.`} />
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[10px] border border-[#c3c6d2]/50 p-3">
                  <div className="text-xs text-brand-muted">Employees</div>
                  <div className="text-lg font-bold text-brand-navy">{tracker.headcount}</div>
                </div>
                <div className="rounded-[10px] border border-[#c3c6d2]/50 p-3">
                  <div className="text-xs text-brand-muted">Total YTD Basic Salary</div>
                  <div className="text-lg font-bold text-brand-navy">
                    {peso(tracker.totalYtdBasicSalary)}
                  </div>
                </div>
                <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-xs text-emerald-800">Total 13th-Month Liability</div>
                  <div className="text-lg font-bold text-emerald-900">
                    {peso(tracker.totalThirteenthMonthPay)}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold uppercase tracking-wider text-brand-muted">
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3 text-right">Months Earned</th>
                      <th className="px-4 py-3 text-right">YTD Basic Salary</th>
                      <th className="px-4 py-3 text-right">13th-Month Pay (÷12)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c3c6d2]/30">
                    {tracker.employees.map((row) => (
                      <tr key={row.employee.id} className="transition-colors hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-semibold text-brand-navy">
                          {row.employee.firstName} {row.employee.lastName}
                        </td>
                        <td className="px-4 py-3 text-xs text-brand-muted">
                          {row.employee.department?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.monthsWithEarnings}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{peso(row.ytdBasicSalary)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-800">
                          {peso(row.thirteenthMonthPay)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-brand-muted">
                Basic salary excludes overtime, night differential, holiday and rest-day premiums, and
                any prior 13th-month run.
              </p>
            </>
          )}
        </SectionCard>
      ) : (
        <>
          {canManage ? (
            <SectionCard title="Assign a De Minimis Benefit">
              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-navy">Employee</label>
                    <Select
                      value={benefitEmployeeId}
                      onValueChange={(v) => setBenefitEmployeeId(v ?? "")}
                    >
                      <SelectTrigger className="h-9 border-[#c3c6d2] text-xs">
                        <SelectValue placeholder="Select an employee…" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.firstName} {e.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-navy">Benefit Type</label>
                    <Select
                      value={benefitType}
                      onValueChange={(v) => setBenefitType((v ?? "") as DeMinimisType)}
                    >
                      <SelectTrigger className="h-9 border-[#c3c6d2] text-xs">
                        <SelectValue placeholder="Select a benefit…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(catalog ?? []).map((rule) => (
                          <SelectItem key={rule.type} value={rule.type}>
                            {rule.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-brand-navy">Monthly Amount (₱)</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-9 text-xs"
                      placeholder="1500.00"
                      value={benefitAmount}
                      onChange={(e) => setBenefitAmount(e.target.value)}
                    />
                  </div>
                </div>

                {selectedRule ? (
                  <p className="rounded-[10px] border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <strong>BIR ceiling:</strong> {selectedRule.statutoryBasis}. Anything above the
                    ceiling is capped here and remains taxable compensation.
                  </p>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="bg-brand text-white hover:bg-brand-dark"
                    disabled={
                      assignMutation.isPending ||
                      !benefitEmployeeId ||
                      !benefitType ||
                      benefitAmount.trim() === "" ||
                      Number.isNaN(Number(benefitAmount))
                    }
                    onClick={() =>
                      assignMutation.mutate({
                        employeeId: benefitEmployeeId,
                        benefitType: benefitType as DeMinimisType,
                        monthlyAmount: Number(benefitAmount),
                      })
                    }
                  >
                    {assignMutation.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Assign Benefit
                  </Button>
                </div>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard
            title="Assigned Benefits"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchBenefits()}
                className="h-9 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            }
          >
            {benefitsLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : (benefits ?? []).length === 0 ? (
              <EmptyState message="No de minimis benefits have been assigned yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold uppercase tracking-wider text-brand-muted">
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Benefit</th>
                      <th className="px-4 py-3 text-right">Monthly (Effective)</th>
                      <th className="px-4 py-3 text-right">BIR Cap</th>
                      {canManage ? <th className="px-4 py-3 text-right">Action</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c3c6d2]/30">
                    {(benefits ?? []).map((b) => {
                      const rule = catalog?.find((r) => r.type === b.benefitType);
                      const capped = Number(b.requestedAmount) > Number(b.monthlyAmount);
                      return (
                        <tr key={b.id} className="transition-colors hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-semibold text-brand-navy">
                            {b.employee ? `${b.employee.firstName} ${b.employee.lastName}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs">{rule?.label ?? b.benefitType}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {peso(Number(b.monthlyAmount))}
                            {capped ? (
                              <div className="text-[10px] font-semibold text-amber-700">
                                capped from {peso(Number(b.requestedAmount))}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-right text-xs tabular-nums text-brand-muted">
                            {b.birMonthlyCap === null ? "No peso cap" : peso(Number(b.birMonthlyCap))}
                          </td>
                          {canManage ? (
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="outline"
                                size="xs"
                                disabled={removeMutation.isPending}
                                onClick={() => removeMutation.mutate(b.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-brand-muted">
              De minimis benefits are added to net pay and excluded from gross, taxable income and
              every SSS / PhilHealth / Pag-IBIG contribution base.
            </p>
          </SectionCard>
        </>
      )}
    </div>
  );
}
