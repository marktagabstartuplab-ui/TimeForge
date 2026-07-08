"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError } from "@/lib/api/client";
import { exportOrgStructure } from "../api/org-management.service";
import type { ToastState } from "@/components/shared/Toast";

const FORMATS = [
  { value: "CSV" as const, label: "Export as CSV" },
  { value: "EXCEL" as const, label: "Export as Excel" },
  { value: "PDF" as const, label: "Export as PDF" },
];

export function ExportOrgButton({ onToast }: { onToast: (t: ToastState) => void }) {
  const exportMutation = useMutation({
    mutationFn: (format: "CSV" | "EXCEL" | "PDF") => exportOrgStructure(format),
    onSuccess: () => {
      onToast({ message: "Export queued — you'll get a notification with the download link when it's ready.", tone: "success" });
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Export failed.", tone: "error" }),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="outline" disabled={exportMutation.isPending}>
            {exportMutation.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            Export Structure
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {FORMATS.map((f) => (
          <DropdownMenuItem key={f.value} onClick={() => exportMutation.mutate(f.value)}>
            {f.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
