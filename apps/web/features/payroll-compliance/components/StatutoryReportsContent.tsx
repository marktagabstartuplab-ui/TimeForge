"use client";

import { Fragment, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getBirReport,
  getContributionReport,
  type ContributionAgency,
  type ContributionReport,
} from "../api/payroll-compliance.service";
import { listPeriods } from "@/features/payroll-processing/api/payroll-processing.service";

type TabKey = "contributions" | "bir";

const TABS: { key: TabKey; label: string }[] = [
  { key: "contributions", label: "Contributions" },
  { key: "bir", label: "BIR" },
];

const AGENCIES: { key: ContributionAgency; label: string }[] = [
  { key: "sss", label: "SSS" },
  { key: "philhealth", label: "PhilHealth" },
  { key: "pagibig", label: "Pag-IBIG" },
];

const ALL_DEPARTMENTS = "__ALL__";

/**
 * Matches the payroll-period picker on Payroll Processing ("Dec 16, 2026 -
 * Dec 31, 2026 · GENERATED") so the same period reads identically on both
 * screens. Kept in sync with formatDateRange in FinancePayrollProcessingContent.
 */
function formatDateRange(start: string, end: string): string {
  const opt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${new Date(start).toLocaleDateString("en-US", opt)} - ${new Date(end).toLocaleDateString("en-US", opt)}`;
}

const peso = (value: string | number) =>
  `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Escapes a CSV cell — names contain commas ("Cruz, Ana") and would split the row. */
function csvCell(value: string | number | boolean): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, header: string[], rows: (string | number | boolean)[][]) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`﻿${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** One employee's line across all three agencies. */
interface CombinedRow {
  userId: string;
  name: string;
  email: string;
  department: string | null;
  monthlyGrossBasis: number;
  sss: { employee: number; employer: number };
  philhealth: { employee: number; employer: number };
  pagibig: { employee: number; employer: number };
  employeeTotal: number;
  employerTotal: number;
}

/**
 * Folds the three per-agency reports into one row per employee.
 *
 * Merged client-side rather than adding a combined endpoint: the three reports
 * already cover the same period and employee set, so this needs no new API
 * surface and works against the deployed backend unchanged.
 */
function combineReports(reports: (ContributionReport | undefined)[]): CombinedRow[] {
  const byUser = new Map<string, CombinedRow>();

  reports.forEach((report, agencyIndex) => {
    if (!report) return;
    const agency = AGENCIES[agencyIndex].key;

    for (const row of report.rows) {
      let combined = byUser.get(row.userId);
      if (!combined) {
        combined = {
          userId: row.userId,
          name: row.name,
          email: row.email,
          department: row.department,
          monthlyGrossBasis: Number(row.monthlyGrossBasis),
          sss: { employee: 0, employer: 0 },
          philhealth: { employee: 0, employer: 0 },
          pagibig: { employee: 0, employer: 0 },
          employeeTotal: 0,
          employerTotal: 0,
        };
        byUser.set(row.userId, combined);
      }
      const employee = Number(row.employeeShare);
      const employer = Number(row.employerShare);
      combined[agency] = { employee, employer };
      combined.employeeTotal += employee;
      combined.employerTotal += employer;
    }
  });

  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function StatutoryReportsContent() {
  const [tab, setTab] = useState<TabKey>("contributions");
  const [periodId, setPeriodId] = useState<string>("");
  const [department, setDepartment] = useState<string>(ALL_DEPARTMENTS);

  const { data: periodsPage } = useQuery({
    queryKey: ["payroll", "periods"],
    queryFn: listPeriods,
  });

  // Only generated periods have line items to report on.
  const periods = useMemo(
    () => (periodsPage?.data ?? []).filter((p) => p.status !== "OPEN"),
    [periodsPage],
  );

  const isBir = tab === "bir";

  // All three agencies are fetched together so the combined table can show them
  // side by side instead of making the user click through a tab each.
  const contributionQueries = useQueries({
    queries: AGENCIES.map((agency) => ({
      queryKey: ["payroll", "report", agency.key, periodId],
      queryFn: () => getContributionReport(agency.key, periodId || undefined),
      enabled: !isBir,
    })),
  });

  const birQuery = useQuery({
    queryKey: ["payroll", "report", "bir", periodId],
    queryFn: () => getBirReport(periodId || undefined),
    enabled: isBir,
  });

  const isLoading = isBir
    ? birQuery.isLoading
    : contributionQueries.some((q) => q.isLoading);
  const isError = isBir ? birQuery.isError : contributionQueries.some((q) => q.isError);
  const refetch = () => {
    if (isBir) birQuery.refetch();
    else contributionQueries.forEach((q) => q.refetch());
  };

  // Computed on each render rather than memoised: the input is one period's
  // worth of rows, and memoising it would need a dependency on the query
  // results, which are new array identities on every fetch anyway.
  const combinedRows = combineReports(contributionQueries.map((q) => q.data));

  const reportPeriod = isBir ? birQuery.data?.period : contributionQueries[0]?.data?.period;

  // Department list is derived from whatever the current report returned, so it
  // never offers a department with no rows in this period.
  const departments = [
    ...new Set(
      (isBir ? (birQuery.data?.rows ?? []) : combinedRows)
        .map((r) => r.department)
        .filter((d): d is string => Boolean(d)),
    ),
  ].sort();

  const matchesDepartment = (d: string | null) =>
    department === ALL_DEPARTMENTS || d === department;

  const visibleCombined = combinedRows.filter((r) => matchesDepartment(r.department));
  const visibleBir = (birQuery.data?.rows ?? []).filter((r) => matchesDepartment(r.department));

  // Totals follow the department filter — a filtered view whose totals still
  // covered the whole org would be actively misleading on a remittance report.
  const combinedTotals = visibleCombined.reduce(
    (acc, r) => ({
      employee: acc.employee + r.employeeTotal,
      employer: acc.employer + r.employerTotal,
      sss: acc.sss + r.sss.employee + r.sss.employer,
      philhealth: acc.philhealth + r.philhealth.employee + r.philhealth.employer,
      pagibig: acc.pagibig + r.pagibig.employee + r.pagibig.employer,
    }),
    { employee: 0, employer: 0, sss: 0, philhealth: 0, pagibig: 0 },
  );

  const birTotals = visibleBir.reduce(
    (acc, r) => ({
      gross: acc.gross + Number(r.grossCompensation),
      contributions: acc.contributions + Number(r.mandatoryContributions),
      taxable: acc.taxable + Number(r.taxableCompensation),
      withheld: acc.withheld + Number(r.taxWithheld),
    }),
    { gross: 0, contributions: 0, taxable: 0, withheld: 0 },
  );

  const rowCount = isBir ? visibleBir.length : visibleCombined.length;

  const handleExport = () => {
    if (!reportPeriod) return;
    const label = reportPeriod.startDate;
    if (isBir) {
      downloadCsv(
        `bir-tax-summary-${label}.csv`,
        ["Employee", "Email", "Department", "Gross", "Contributions", "Taxable", "Tax Withheld", "YTD Taxable", "YTD Tax"],
        visibleBir.map((r) => [
          r.name, r.email, r.department ?? "",
          r.grossCompensation, r.mandatoryContributions, r.taxableCompensation,
          r.taxWithheld, r.ytdTaxableIncome, r.ytdTaxWithheld,
        ]),
      );
    } else {
      downloadCsv(
        `statutory-contributions-${label}.csv`,
        [
          "Employee", "Email", "Department", "Monthly Basis",
          "SSS EE", "SSS ER", "PhilHealth EE", "PhilHealth ER", "Pag-IBIG EE", "Pag-IBIG ER",
          "Employee Total", "Employer Total",
        ],
        visibleCombined.map((r) => [
          r.name, r.email, r.department ?? "", r.monthlyGrossBasis.toFixed(2),
          r.sss.employee.toFixed(2), r.sss.employer.toFixed(2),
          r.philhealth.employee.toFixed(2), r.philhealth.employer.toFixed(2),
          r.pagibig.employee.toFixed(2), r.pagibig.employer.toFixed(2),
          r.employeeTotal.toFixed(2), r.employerTotal.toFixed(2),
        ]),
      );
    }
  };

  const cardClass =
    "rounded-[16px] border border-[#c3c6d2]/50 bg-white p-4 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-brand-navy">Statutory Reports</h1>
        <p className="text-sm text-brand-muted">
          Remittance and withholding summaries for SSS, PhilHealth, Pag-IBIG and the BIR.
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-4 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-[#f4f5f7] p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  tab === t.key
                    ? "bg-white text-brand-navy shadow-[0px_1px_2px_rgba(0,0,0,0.08)]"
                    : "text-brand-muted hover:text-brand-navy"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="h-8 rounded-md border border-[#c3c6d2]/60 bg-white px-2 text-xs text-brand-navy"
              aria-label="Department"
            >
              <option value={ALL_DEPARTMENTS}>All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              className="h-8 rounded-md border border-[#c3c6d2]/60 bg-white px-2 text-xs text-brand-navy"
              aria-label="Payroll period"
            >
              <option value="">Latest generated period</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatDateRange(p.startDate, p.endDate)} · {p.status}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading} className="h-8 text-xs">
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={rowCount === 0}
              className="h-8 text-xs"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      {isError ? (
        <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          No generated payroll period to report on yet. Generate a payroll period first.
        </div>
      ) : isLoading ? (
        <div className="h-64 bg-gray-100 rounded-[16px] animate-pulse" />
      ) : !reportPeriod ? null : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {isBir
              ? [
                  { label: "Gross Compensation", value: birTotals.gross },
                  { label: "Mandatory Contributions", value: birTotals.contributions },
                  { label: "Taxable Compensation", value: birTotals.taxable },
                  { label: "Tax Withheld", value: birTotals.withheld },
                ].map((card) => (
                  <div key={card.label} className={cardClass}>
                    <p className="text-xs text-brand-muted">{card.label}</p>
                    <p className="text-xl font-bold text-brand-navy mt-1">{peso(card.value)}</p>
                  </div>
                ))
              : [
                  { label: "SSS Total", value: combinedTotals.sss },
                  { label: "PhilHealth Total", value: combinedTotals.philhealth },
                  { label: "Pag-IBIG Total", value: combinedTotals.pagibig },
                ].map((card) => (
                  <div key={card.label} className={cardClass}>
                    <p className="text-xs text-brand-muted">{card.label}</p>
                    <p className="text-xl font-bold text-brand-navy mt-1">{peso(card.value)}</p>
                  </div>
                ))}
            <div className={cardClass}>
              <p className="text-xs text-brand-muted">
                {isBir ? "Employees" : "Employee / Employer"}
              </p>
              {isBir ? (
                <p className="text-xl font-bold text-brand-navy mt-1">{rowCount}</p>
              ) : (
                <p className="text-sm font-bold text-brand-navy mt-1">
                  {peso(combinedTotals.employee)} / {peso(combinedTotals.employer)}
                </p>
              )}
              <p className="text-[11px] text-brand-muted mt-0.5">
                {formatDateRange(reportPeriod.startDate, reportPeriod.endDate)}
                {isBir ? "" : ` · ${rowCount} employee${rowCount === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
            {rowCount === 0 ? (
              <div className="flex flex-col items-center gap-2 p-12 text-center">
                <FileSpreadsheet className="h-8 w-8 text-brand-muted/60" />
                <p className="text-sm font-semibold text-brand-navy">
                  {department === ALL_DEPARTMENTS
                    ? "No employees in this period"
                    : `No employees in ${department} for this period`}
                </p>
                <p className="text-xs text-brand-muted">
                  {department === ALL_DEPARTMENTS
                    ? "Generate the payroll period to populate its line items."
                    : "Try a different department or period."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {isBir ? (
                      <tr className="border-b border-[#c3c6d2]/40 bg-[#fafbfc]">
                        <th className="text-left font-semibold text-brand-navy px-4 py-3">Employee</th>
                        <th className="text-left font-semibold text-brand-navy px-4 py-3">Department</th>
                        <th className="text-right font-semibold text-brand-navy px-4 py-3">Gross</th>
                        <th className="text-right font-semibold text-brand-navy px-4 py-3">Contributions</th>
                        <th className="text-right font-semibold text-brand-navy px-4 py-3">Taxable</th>
                        <th className="text-right font-semibold text-brand-navy px-4 py-3">Tax Withheld</th>
                        <th className="text-right font-semibold text-brand-navy px-4 py-3">YTD Tax</th>
                      </tr>
                    ) : (
                      <>
                        <tr className="border-b border-[#c3c6d2]/20 bg-[#fafbfc]">
                          <th className="px-4 pt-3 pb-1" colSpan={3} />
                          {AGENCIES.map((a) => (
                            <th
                              key={a.key}
                              colSpan={2}
                              className="text-center text-[11px] font-bold uppercase tracking-wider text-brand-muted px-4 pt-3 pb-1 border-l border-[#c3c6d2]/30"
                            >
                              {a.label}
                            </th>
                          ))}
                          <th
                            colSpan={2}
                            className="text-center text-[11px] font-bold uppercase tracking-wider text-brand-muted px-4 pt-3 pb-1 border-l border-[#c3c6d2]/30"
                          >
                            Total
                          </th>
                        </tr>
                        <tr className="border-b border-[#c3c6d2]/40 bg-[#fafbfc]">
                          <th className="text-left font-semibold text-brand-navy px-4 pb-3">Employee</th>
                          <th className="text-left font-semibold text-brand-navy px-4 pb-3">Department</th>
                          <th className="text-right font-semibold text-brand-navy px-4 pb-3">Monthly Basis</th>
                          {AGENCIES.map((a) => (
                            <Fragment key={a.key}>
                              <th className="text-right font-semibold text-brand-navy px-4 pb-3 border-l border-[#c3c6d2]/30">EE</th>
                              <th className="text-right font-semibold text-brand-navy px-4 pb-3">ER</th>
                            </Fragment>
                          ))}
                          <th className="text-right font-semibold text-brand-navy px-4 pb-3 border-l border-[#c3c6d2]/30">EE</th>
                          <th className="text-right font-semibold text-brand-navy px-4 pb-3">ER</th>
                        </tr>
                      </>
                    )}
                  </thead>
                  <tbody>
                    {isBir
                      ? visibleBir.map((r) => (
                          <tr key={r.userId} className="border-b border-[#c3c6d2]/20 last:border-0">
                            <td className="px-4 py-3">
                              <span className="font-medium text-brand-navy">{r.name}</span>
                              <span className="block text-xs text-brand-muted">{r.email}</span>
                            </td>
                            <td className="px-4 py-3 text-brand-muted">{r.department ?? "—"}</td>
                            <td className="px-4 py-3 text-right">{peso(r.grossCompensation)}</td>
                            <td className="px-4 py-3 text-right">{peso(r.mandatoryContributions)}</td>
                            <td className="px-4 py-3 text-right">{peso(r.taxableCompensation)}</td>
                            <td className="px-4 py-3 text-right font-semibold">{peso(r.taxWithheld)}</td>
                            <td className="px-4 py-3 text-right text-brand-muted">{peso(r.ytdTaxWithheld)}</td>
                          </tr>
                        ))
                      : visibleCombined.map((r) => (
                          <tr key={r.userId} className="border-b border-[#c3c6d2]/20 last:border-0">
                            <td className="px-4 py-3">
                              <span className="font-medium text-brand-navy">{r.name}</span>
                              <span className="block text-xs text-brand-muted">{r.email}</span>
                            </td>
                            <td className="px-4 py-3 text-brand-muted">{r.department ?? "—"}</td>
                            <td className="px-4 py-3 text-right">{peso(r.monthlyGrossBasis)}</td>
                            {AGENCIES.map((a) => (
                              <Fragment key={a.key}>
                                <td className="px-4 py-3 text-right border-l border-[#c3c6d2]/30">
                                  {peso(r[a.key].employee)}
                                </td>
                                <td className="px-4 py-3 text-right text-brand-muted">
                                  {peso(r[a.key].employer)}
                                </td>
                              </Fragment>
                            ))}
                            <td className="px-4 py-3 text-right font-semibold border-l border-[#c3c6d2]/30">
                              {peso(r.employeeTotal)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-brand-muted">
                              {peso(r.employerTotal)}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
