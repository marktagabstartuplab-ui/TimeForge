"use client";

import { useEffect } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastState {
  message: string;
  tone?: "success" | "error";
}

interface ToastProps {
  toast: ToastState | null;
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. */
  duration?: number;
}

/** Minimal fixed-position toast — parent owns the state. */
export function Toast({ toast, onDismiss, duration = 3500 }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(id);
  }, [toast, duration, onDismiss]);

  if (!toast) return null;
  const isError = toast.tone === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-[12px] px-4 py-3 text-sm font-semibold shadow-lg",
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
        isError ? "bg-red-600 text-white" : "bg-brand-navy text-white",
      )}
    >
      {isError ? (
        <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-cyan" aria-hidden="true" />
      )}
      {toast.message}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="ml-1 rounded-full px-1.5 text-white/70 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
