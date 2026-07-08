"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormBanner } from "@/features/auth/components/FormMessages";
import { ApiError } from "@/lib/api/client";
import { listEmployees, updateEmployee } from "@/features/employee-management/api/employee-management.service";
import type { DepartmentRow } from "../api/org-management.service";
import type { ToastState } from "@/components/shared/Toast";

export function AssignEmployeesModal({
  open,
  onOpenChange,
  departments,
  onToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: DepartmentRow[];
  onToast: (t: ToastState) => void;
}) {
  const queryClient = useQueryClient();
  const [departmentId, setDepartmentId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: employeesPage } = useQuery({
    queryKey: ["org-management", "employee-picker"],
    queryFn: () => listEmployees({ limit: 100, status: "ACTIVE" }),
    enabled: open,
  });
  const rows = employeesPage?.data ?? [];

  const submit = useMutation({
    mutationFn: async () => {
      const targets = rows.filter((r) => selected.has(r.id));
      return Promise.allSettled(targets.map((r) => updateEmployee(r.id, { departmentId, version: r.version })));
    },
    onSuccess: (results) => {
      const failed = results.filter((r) => r.status === "rejected").length;
      onToast(
        failed > 0
          ? { message: `Assigned ${results.length - failed}, ${failed} failed.`, tone: "error" }
          : { message: `Assigned ${results.length} employee(s) to the department.`, tone: "success" },
      );
      queryClient.invalidateQueries({ queryKey: ["org-management"] });
      queryClient.invalidateQueries({ queryKey: ["employee-management"] });
      reset();
      onOpenChange(false);
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  function reset() {
    setDepartmentId("");
    setSelected(new Set());
    setServerError(null);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent>
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <DialogTitle>Assign Employees</DialogTitle>
            <DialogDescription>Move selected employees into a department.</DialogDescription>
          </div>
          <DialogCloseButton />
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          {serverError ? <FormBanner message={serverError} /> : null}

          <div>
            <Label className="mb-1.5">Department</Label>
            <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a department" /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5">Employees</Label>
            {rows.length === 0 ? (
              <EmptyState message="No employees found." />
            ) : (
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-[10px] border border-[#c3c6d2]/50 p-2">
                {rows.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm hover:bg-[#f6f3f4]">
                    <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                    <span className="text-brand-ink">{e.firstName} {e.lastName}</span>
                    <span className="ml-auto text-xs text-brand-muted">{e.department?.name ?? "Unassigned"}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" onClick={() => submit.mutate()} disabled={!departmentId || selected.size === 0 || submit.isPending}>
              {submit.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Assign {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
