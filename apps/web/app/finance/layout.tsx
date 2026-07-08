import { FinanceAppShell } from "@/features/finance/components/FinanceAppShell";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <FinanceAppShell>{children}</FinanceAppShell>;
}
