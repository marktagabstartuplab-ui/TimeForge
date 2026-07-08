"use client";

import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  pending,
  onConfirm,
}: ConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(440px,calc(100vw-2rem))]">
        <div className="flex flex-col gap-2 px-6 pt-6">
          <DialogTitle className="text-xl font-bold text-brand-navy">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-5">
          <DialogClose className="rounded-[10px] px-4 py-2 text-sm font-bold text-brand-ink hover:bg-[#f6f3f4]">
            Cancel
          </DialogClose>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={
              destructive
                ? "flex h-10 items-center gap-2 rounded-[10px] bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
                : "flex h-10 items-center gap-2 rounded-[10px] bg-brand px-5 text-sm font-bold text-white hover:bg-[#1467d6] disabled:opacity-60"
            }
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
