import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SectionCard({ title, action, children, className }: SectionCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl text-brand-navy">{title}</h3>
        {action ? <div className="min-w-0">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}
