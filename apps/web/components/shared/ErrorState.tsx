"use client";

import { AlertTriangle } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = "Something went wrong while loading.", onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[12px] border border-red-100 bg-red-50/60 px-6 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-red-400" aria-hidden="true" />
      <p className="text-sm text-brand-muted">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-[8px] border border-[#c3c6d2] bg-white px-4 py-1.5 text-sm font-medium text-brand-navy hover:bg-[#f6f3f4]"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
