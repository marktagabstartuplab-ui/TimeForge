"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, ShieldQuestion } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestShiftOverride } from "../api/shift-limits.service";
import { ApiError } from "@/lib/api/client";

interface OverrideRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Mirrors the API's Min(15)/Max(480) bounds on `additionalMinutes`. */
const EXTENSION_CHOICES = [30, 60, 120, 240];

/**
 * Asks the employee's supervisor to extend the current session's shift limit.
 * The extension is applied to the session deadline only once the supervisor
 * approves — submitting this does not itself buy any extra time.
 */
export function OverrideRequestModal({ open, onOpenChange }: OverrideRequestModalProps) {
  const queryClient = useQueryClient();
  const [additionalMinutes, setAdditionalMinutes] = useState(60);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      requestShiftOverride({
        additionalMinutes,
        reason: reason.trim() ? reason.trim() : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-session", "current"] });
      setReason("");
      setError(null);
      onOpenChange(false);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Could not send the extension request"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(520px,100%)]" aria-label="Request shift extension">
        <div className="flex items-start gap-3 border-b border-[#c3c6d2]/40 p-6 pb-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-amber-100 text-amber-700">
            <ShieldQuestion className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-xl">Request shift extension</DialogTitle>
            <DialogDescription>
              Your supervisor decides. Until they approve, your existing limit still applies.
            </DialogDescription>
          </div>
          <DialogCloseButton />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <fieldset>
            <legend className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-muted">
              Additional time
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXTENSION_CHOICES.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={additionalMinutes === minutes}
                  onClick={() => setAdditionalMinutes(minutes)}
                  className={
                    additionalMinutes === minutes
                      ? "h-10 rounded-[8px] bg-brand px-4 text-sm font-bold text-white"
                      : "h-10 rounded-[8px] border border-[#c3c6d2]/60 bg-white px-4 text-sm font-bold text-brand-navy transition-colors hover:bg-[#f6f3f4]"
                  }
                >
                  {minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="mt-5 block">
            <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-muted">
              Reason (optional)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Production release needs to finish tonight"
              className="mt-1.5 w-full resize-y rounded-[10px] border border-[#c3c6d2]/60 px-3 py-2 text-sm text-brand-ink outline-none focus:border-brand"
            />
          </label>

          {error ? (
            <p role="alert" className="mt-4 rounded-[8px] bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#c3c6d2]/40 p-6 pt-4">
          <DialogClose className="flex h-11 items-center justify-center rounded-[10px] border border-[#c3c6d2]/60 bg-white px-5 text-sm font-bold text-brand-navy transition-colors hover:bg-[#f6f3f4]">
            Cancel
          </DialogClose>
          <button
            type="button"
            onClick={() => {
              setError(null);
              submit.mutate();
            }}
            disabled={submit.isPending}
            className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-[#1467d6] disabled:opacity-60"
          >
            {submit.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            Send request
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
