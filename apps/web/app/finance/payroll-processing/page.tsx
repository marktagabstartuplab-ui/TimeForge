import type { Metadata } from "next";
import { FinancePayrollProcessingContent } from "@/features/finance/components/FinancePayrollProcessingContent";

export const metadata: Metadata = { title: "Payroll Processing | TimeForge" };

export default function FinancePayrollProcessingPage() {
  return <FinancePayrollProcessingContent />;
}
