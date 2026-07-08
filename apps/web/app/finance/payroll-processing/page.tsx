import type { Metadata } from "next";
import { AdminOnly } from "@/features/admin/components/AdminOnly";
import { PayrollProcessingContent } from "@/features/payroll-processing/components/PayrollProcessingContent";

export const metadata: Metadata = { title: "Payroll Processing | TimeForge" };

export default function FinancePayrollProcessingPage() {
  return (
    <AdminOnly>
      <PayrollProcessingContent />
    </AdminOnly>
  );
}
