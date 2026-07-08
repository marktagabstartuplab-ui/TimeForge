import { Clock } from "lucide-react";

export function ComingSoonPanel({ message }: { message?: string }) {
  return (
    <div className="rounded-modal flex flex-col items-center gap-3 border border-[#c3c6d2]/60 bg-[#f6f3f4] px-6 py-8 text-center">
      <Clock className="h-8 w-8 text-brand-muted/70" aria-hidden="true" />
      <p className="text-body font-medium text-brand-navy">
        {message ?? "This feature is coming soon."}
      </p>
    </div>
  );
}
