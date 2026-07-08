import { cn } from "@/lib/utils";

interface AuthCardProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] sm:p-8",
        "animate-in fade-in duration-300",
        className,
      )}
    >
      {children}
    </div>
  );
}
