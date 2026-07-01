import { cn } from "@/lib/utils";

interface AuthCardProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div
        className={cn(
          "w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-shadow duration-200 sm:p-10",
          "animate-in fade-in duration-300",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function AuthCardHeader({
  title,
  description,
  align = "left",
}: {
  title: string;
  description?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("mb-6", align === "center" ? "text-center" : "text-left")}>
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      {description ? <p className="mt-2 text-sm text-gray-500">{description}</p> : null}
    </div>
  );
}
