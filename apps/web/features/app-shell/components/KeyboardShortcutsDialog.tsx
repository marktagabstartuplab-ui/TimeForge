"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
} from "@/components/ui/dialog";

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: "?", description: "Open this shortcuts guide" },
  { keys: "Esc", description: "Close the open menu or dialog" },
  { keys: "↑ ↓", description: "Move between items in an open menu" },
  { keys: "Enter", description: "Activate the focused menu item" },
  { keys: "Tab", description: "Move focus to the next field or control" },
];

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(420px,calc(100vw-2rem))]">
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>Navigate TimeForge without leaving the keyboard.</DialogDescription>
          </div>
          <DialogCloseButton />
        </div>
        <ul className="flex flex-col gap-1 px-6 py-5">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-4 py-1.5">
              <span className="text-sm text-brand-muted">{s.description}</span>
              <kbd className="rounded-[6px] border border-[#c3c6d2] bg-[#f6f3f4] px-2 py-1 text-xs font-semibold text-brand-navy">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
