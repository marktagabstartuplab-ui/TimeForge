import { Clock } from "lucide-react";

export function ComingSoonPanel({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-6 py-8 text-center">
      <Clock className="h-8 w-8 text-gray-400" aria-hidden="true" />
      <p className="text-sm font-medium text-gray-700">
        {message ?? "This feature is coming soon."}
      </p>
    </div>
  );
}
