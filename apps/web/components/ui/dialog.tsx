"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogBackdrop({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-backdrop"
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-200",
        "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Centered modal popup (EOD Review, confirmations). Scrolls internally when
 * taller than the viewport.
 *
 * Centering is done by a full-viewport flex positioner rather than
 * `top-1/2 left-1/2 -translate-1/2` on the popup itself: a `position: fixed`
 * element is laid out against the nearest ancestor that establishes a
 * containing block (any ancestor with a transform/filter/backdrop-filter/
 * contain), which pushed the popup out of view — BUG-AD. The positioner is
 * pointer-events-none so backdrop clicks still reach the backdrop and close
 * the dialog.
 */
function DialogContent({
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogBackdrop />
      <div
        data-slot="dialog-positioner"
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
      >
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(
            "pointer-events-auto relative m-auto flex max-h-[92dvh] w-[min(640px,100%)] flex-col overflow-hidden rounded-[16px] bg-white shadow-xl outline-none",
            "transition-all duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </DialogPrimitive.Popup>
      </div>
    </DialogPrimitive.Portal>
  );
}

/**
 * Right-anchored slide-over panel (Request Leave). Full height, fixed footer
 * region handled by the consumer.
 */
function SheetContent({
  className,
  children,
  ...props
}: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogBackdrop />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-dvh w-full max-w-[512px] flex-col overflow-hidden bg-[#faf9f9] shadow-2xl outline-none",
          "transition-transform duration-300 data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-2xl font-bold text-brand", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-brand-muted", className)}
      {...props}
    />
  );
}

/** Round icon-only close button used in dialog/sheet headers. */
function DialogCloseButton({ className, ...props }: DialogPrimitive.Close.Props) {
  return (
    <DialogPrimitive.Close
      aria-label="Close"
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full text-brand-ink transition-colors hover:bg-black/5",
        className,
      )}
      {...props}
    >
      <X className="h-5 w-5" aria-hidden="true" />
    </DialogPrimitive.Close>
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogCloseButton,
  DialogContent,
  SheetContent,
  DialogTitle,
  DialogDescription,
};
