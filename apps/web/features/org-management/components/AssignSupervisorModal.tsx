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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormBanner } from "@/features/auth/components/FormMessages";
import { ApiError } from "@/lib/api/client";
import { listEmployees } from "@/features/employee-management/api/employee-management.service";
import { updateDepartment, type DepartmentRow } from "../api/org-management.service";
import type { ToastState } from "@/components/shared/Toast";

export function AssignSupervisorModal({
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
  const [managerId, setManagerId] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: employeesPage } = useQuery({
    queryKey: ["org-management", "employee-picker"],
    queryFn: () => listEmployees({ limit: 100, status: "ACTIVE" }),
    enabled: open,
  });

  const selectedDept = departments.find((d) => d.id === departmentId) ?? null;

  const submit = useMutation({
    mutationFn: () => updateDepartment(departmentId, { managerId, version: selectedDept!.version }),
    onSuccess: () => {
      onToast({ message: "Supervisor assigned.", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["org-management"] });
      reset();
      onOpenChange(false);
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  function reset() {
    setDepartmentId("");
    setManagerId("");
    setServerError(null);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent>
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <DialogTitle>Assign Supervisor</DialogTitle>
            <DialogDescription>Set the department head for an existing department.</DialogDescription>
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
            <Label className="mb-1.5">Supervisor</Label>
            <Select value={managerId} onValueChange={(v) => setManagerId(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select an employee" /></SelectTrigger>
              <SelectContent>
                {employeesPage?.data.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" onClick={() => submit.mutate()} disabled={!departmentId || !managerId || submit.isPending}>
              {submit.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Assign
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
