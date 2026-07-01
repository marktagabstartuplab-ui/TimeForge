import Link from "next/link";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
        <Clock className="h-4.5 w-4.5 text-white" strokeWidth={2.25} />
      </span>
      <span className="text-lg font-bold text-gray-900">TimeForge</span>
    </Link>
  );
}
