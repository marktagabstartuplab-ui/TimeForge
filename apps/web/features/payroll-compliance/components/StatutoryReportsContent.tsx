"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getBirReport,
  getContributionReport,
  type ContributionAgency,
} from "../api/payroll-compliance.service";
import { listPeriods } from "@/features/payroll-processing/api/payroll-processing.service";

type TabKey = ContributionAgency | "bir";

const TABS: { key: TabKey; label: string }[] = [
  { key: "sss", label: "SSS" },
  { key: "philhealth", label: "PhilHealth" },
  { key: "pagibig", label: "Pag-IBIG" },
  { key: "bir", label: "BIR" },
];

/**
 * `/payroll/periods` returns full ISO timestamps while the report endpoints
 * return date-only strings, so the dropdown needs trimming to match.
 */
const dateOnly = (value: string) => value.slice(0, 10);

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

export function StatutoryReportsContent() {
  const [tab, setTab] = useState<TabKey>("sss");
  const [periodId, setPeriodId] = useState<string>("");

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

  const contributionQuery = useQuery({
    queryKey: ["payroll", "report", tab, periodId],
    queryFn: () => getContributionReport(tab as ContributionAgency, periodId || undefined),
    enabled: !isBir,
  });

  const birQuery = useQuery({
    queryKey: ["payroll", "report", "bir", periodId],
    queryFn: () => getBirReport(periodId || undefined),
    enabled: isBir,
  });

  const isLoading = isBir ? birQuery.isLoading : contributionQuery.isLoading;
  const isError = isBir ? birQuery.isError : contributionQuery.isError;
  const refetch = isBir ? birQuery.refetch : contributionQuery.refetch;
  const report = isBir ? birQuery.data : contributionQuery.data;

  const handleExport = () => {
    if (!report) return;
    const label = report.period.startDate;
    if (isBir && birQuery.data) {
      downloadCsv(
        `bir-tax-summary-${label}.csv`,
        ["Employee", "Email", "Gross", "Contributions", "Taxable", "Tax Withheld", "YTD Taxable", "YTD Tax"],
        birQuery.data.rows.map((r) => [
          r.name,
          r.email,
          r.grossCompensation,
          r.mandatoryContributions,
          r.taxableCompensation,
          r.taxWithheld,
          r.ytdTaxableIncome,
          r.ytdTaxWithheld,
        ]),
      );
    } else if (contributionQuery.data) {
      downloadCsv(
        `${tab}-remittance-${label}.csv`,
        ["Employee", "Email", "Department", "Monthly Basis", "Employee Share", "Employer Share", "Total"],
        contributionQuery.data.rows.map((r) => [
          r.name,
          r.email,
          r.department ?? "",
          r.monthlyGrossBasis,
          r.employeeShare,
          r.employerShare,
          r.total,
        ]),
      );
    }
  };

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

          <div className="flex items-center gap-2">
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              className="h-8 rounded-md border border-[#c3c6d2]/60 bg-white px-2 text-xs text-brand-navy"
              aria-label="Payroll period"
            >
              <option value="">Latest generated period</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {dateOnly(p.startDate)} → {dateOnly(p.endDate)} ({p.status})
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="h-8 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!report || report.rows.length === 0}
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
      ) : !report ? null : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {isBir && birQuery.data
              ? [
                  { label: "Gross Compensation", value: birQuery.data.totals.grossCompensation },
                  { label: "Mandatory Contributions", value: birQuery.data.totals.mandatoryContributions },
                  { label: "Taxable Compensation", value: birQuery.data.totals.taxableCompensation },
                  { label: "Tax Withheld", value: birQuery.data.totals.taxWithheld },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-4 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]"
                  >
                    <p className="text-xs text-brand-muted">{card.label}</p>
                    <p className="text-xl font-bold text-brand-navy mt-1">{peso(card.value)}</p>
                  </div>
                ))
              : contributionQuery.data
                ? [
                    { label: "Employee Share", value: contributionQuery.data.totals.employeeShare },
                    { label: "Employer Share", value: contributionQuery.data.totals.employerShare },
                    { label: "Total Remittance", value: contributionQuery.data.totals.grandTotal },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-4 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]"
                    >
                      <p className="text-xs text-brand-muted">{card.label}</p>
                      <p className="text-xl font-bold text-brand-navy mt-1">{peso(card.value)}</p>
                    </div>
                  ))
                : null}
            <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-4 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
              <p className="text-xs text-brand-muted">Employees</p>
              <p className="text-xl font-bold text-brand-navy mt-1">{report.headcount}</p>
              <p className="text-[11px] text-brand-muted mt-0.5">
                {report.period.startDate} → {report.period.endDate}
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
            {report.rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-12 text-center">
                <FileSpreadsheet className="h-8 w-8 text-brand-muted/60" />
                <p className="text-sm font-semibold text-brand-navy">No employees in this period</p>
                <p className="text-xs text-brand-muted">
                  Generate the payroll period to populate its line items.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#c3c6d2]/40 bg-[#fafbfc]">
                      <th className="text-left font-semibold text-brand-navy px-4 py-3">Employee</th>
                      {isBir ? (
                        <>
                          <th className="text-right font-semibold text-brand-navy px-4 py-3">Gross</th>
                          <th className="text-right font-semibold text-brand-navy px-4 py-3">Contributions</th>
                          <th className="text-right font-semibold text-brand-navy px-4 py-3">Taxable</th>
                          <th className="text-right font-semibold text-brand-navy px-4 py-3">Tax Withheld</th>
                          <th className="text-right font-semibold text-brand-navy px-4 py-3">YTD Tax</th>
                        </>
                      ) : (
                        <>
                          <th className="text-left font-semibold text-brand-navy px-4 py-3">Department</th>
                          <th className="text-right font-semibold text-brand-navy px-4 py-3">Monthly Basis</th>
                          <th className="text-right font-semibold text-brand-navy px-4 py-3">Employee</th>
                          <th className="text-right font-semibold text-brand-navy px-4 py-3">Employer</th>
                          <th className="text-right font-semibold text-brand-navy px-4 py-3">Total</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {isBir && birQuery.data
                      ? birQuery.data.rows.map((r) => (
                          <tr key={r.userId} className="border-b border-[#c3c6d2]/20 last:border-0">
                            <td className="px-4 py-3">
                              <span className="font-medium text-brand-navy">{r.name}</span>
                              <span className="block text-xs text-brand-muted">{r.email}</span>
                            </td>
                            <td className="px-4 py-3 text-right">{peso(r.grossCompensation)}</td>
                            <td className="px-4 py-3 text-right">{peso(r.mandatoryContributions)}</td>
                            <td className="px-4 py-3 text-right">{peso(r.taxableCompensation)}</td>
                            <td className="px-4 py-3 text-right font-semibold">{peso(r.taxWithheld)}</td>
                            <td className="px-4 py-3 text-right text-brand-muted">{peso(r.ytdTaxWithheld)}</td>
                          </tr>
                        ))
                      : contributionQuery.data?.rows.map((r) => (
                          <tr key={r.userId} className="border-b border-[#c3c6d2]/20 last:border-0">
                            <td className="px-4 py-3">
                              <span className="font-medium text-brand-navy">{r.name}</span>
                              <span className="block text-xs text-brand-muted">{r.email}</span>
                            </td>
                            <td className="px-4 py-3 text-brand-muted">{r.department ?? "—"}</td>
                            <td className="px-4 py-3 text-right">{peso(r.monthlyGrossBasis)}</td>
                            <td className="px-4 py-3 text-right">{peso(r.employeeShare)}</td>
                            <td className="px-4 py-3 text-right">{peso(r.employerShare)}</td>
                            <td className="px-4 py-3 text-right font-semibold">{peso(r.total)}</td>
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
