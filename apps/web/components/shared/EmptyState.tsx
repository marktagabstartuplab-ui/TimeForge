import { Inbox, ShieldOff, Clock3, type LucideIcon } from "lucide-react";

const ICONS: Record<"empty" | "restricted" | "comingSoon", LucideIcon> = {
  empty: Inbox,
  restricted: ShieldOff,
  comingSoon: Clock3,
};

interface EmptyStateProps {
  variant?: "empty" | "restricted" | "comingSoon";
  message: string;
  action?: React.ReactNode;
}

export function EmptyState({ variant = "empty", message, action }: EmptyStateProps) {
  const Icon = ICONS[variant];
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[12px] bg-[#f6f3f4] px-6 py-10 text-center">
      <Icon className="h-6 w-6 text-brand-muted/50" aria-hidden="true" />
      <p className="text-sm text-brand-muted">{message}</p>
      {action}
    </div>
  );
}
