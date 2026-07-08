import { cn } from "@/lib/utils";

/** Pulsing placeholder block shown while data loads. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-[8px] bg-[#e4e2e3]", className)}
      {...props}
    />
  );
}
