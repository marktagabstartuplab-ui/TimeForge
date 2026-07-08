"use client";

import Link from "next/link";
import { useState } from "react";
import { UserPlus, Wallet, BarChart3, ScrollText, Loader2, Download } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { CreateEmployeeModal } from "./CreateEmployeeModal";
import { GeneratePayrollModal } from "./GeneratePayrollModal";
import { exportAdminReport } from "../api/admin-dashboard.service";
import type { ToastState } from "@/components/shared/Toast";

export function QuickActionsPanel({ onToast }: { onToast: (t: ToastState) => void }) {
  const [createEmployeeOpen, setCreateEmployeeOpen] = useState(false);
  const [generatePayrollOpen, setGeneratePayrollOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAdminReport();
      onToast({ message: "Report exported.", tone: "success" });
    } catch {
      onToast({ message: "Export failed.", tone: "error" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <SectionCard title="Quick Actions">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setCreateEmployeeOpen(true)}
            className="flex items-center gap-3 rounded-[12px] border border-[#c3c6d2]/50 p-4 text-left transition-colors hover:bg-[#f6f3f4]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-cyan/15 text-brand">
              <UserPlus className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-brand-navy">Create Employee</p>
              <p className="text-xs text-brand-muted">Add a new person to the org</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setGeneratePayrollOpen(true)}
            className="flex items-center gap-3 rounded-[12px] border border-[#c3c6d2]/50 p-4 text-left transition-colors hover:bg-[#f6f3f4]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-cyan/15 text-brand">
              <Wallet className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-brand-navy">Generate Payroll</p>
              <p className="text-xs text-brand-muted">Create &amp; run a payroll period</p>
            </div>
          </button>

          <Link
            href="/reports"
            className="flex items-center gap-3 rounded-[12px] border border-[#c3c6d2]/50 p-4 text-left transition-colors hover:bg-[#f6f3f4]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-cyan/15 text-brand">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-brand-navy">View Reports</p>
              <p className="text-xs text-brand-muted">Timesheets, payroll &amp; KPI reports</p>
            </div>
          </Link>

          <Link
            href="/admin/audit-logs"
            className="flex items-center gap-3 rounded-[12px] border border-[#c3c6d2]/50 p-4 text-left transition-colors hover:bg-[#f6f3f4]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-cyan/15 text-brand">
              <ScrollText className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-brand-navy">Open Audit Logs</p>
              <p className="text-xs text-brand-muted">Full system audit trail</p>
            </div>
          </Link>
        </div>

        <Button type="button" variant="outline" onClick={handleExport} disabled={exporting} className="w-full sm:w-auto">
          {exporting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
          Export Report
        </Button>
      </SectionCard>

      <CreateEmployeeModal open={createEmployeeOpen} onOpenChange={setCreateEmployeeOpen} onToast={onToast} />
      <GeneratePayrollModal open={generatePayrollOpen} onOpenChange={setGeneratePayrollOpen} onToast={onToast} />
    </>
  );
}
