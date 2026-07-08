"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldError, FormBanner } from "@/features/auth/components/FormMessages";
import { ApiError } from "@/lib/api/client";
import { listEmployees } from "@/features/employee-management/api/employee-management.service";
import { departmentSchema, type DepartmentValues } from "../schemas/org-management.schema";
import { createDepartment, updateDepartment, type DepartmentRow } from "../api/org-management.service";
import type { ToastState } from "@/components/shared/Toast";

export function AddDepartmentModal({
  open,
  onOpenChange,
  department,
  onToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  department: DepartmentRow | null;
  onToast: (t: ToastState) => void;
}) {
  const isEdit = Boolean(department);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: employeesPage } = useQuery({
    queryKey: ["org-management", "employee-picker"],
    queryFn: () => listEmployees({ limit: 100, status: "ACTIVE" }),
    enabled: open,
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DepartmentValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { name: "", managerId: undefined },
  });

  useEffect(() => {
    if (open) reset({ name: department?.name ?? "", managerId: department?.managerId ?? undefined });
  }, [open, department, reset]);

  const submit = useMutation({
    mutationFn: (values: DepartmentValues) =>
      isEdit
        ? updateDepartment(department!.id, { name: values.name, managerId: values.managerId ?? null, version: department!.version })
        : createDepartment({ name: values.name, managerId: values.managerId || undefined }),
    onSuccess: () => {
      onToast({ message: isEdit ? "Department updated." : "Department created.", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["org-management"] });
      onOpenChange(false);
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setServerError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <DialogTitle>{isEdit ? "Edit Department" : "Add Department"}</DialogTitle>
            <DialogDescription>{isEdit ? "Update the department name or reassign its manager." : "Create a new department for your organization."}</DialogDescription>
          </div>
          <DialogCloseButton />
        </div>
        <form onSubmit={handleSubmit((values) => submit.mutate(values))} noValidate className="flex flex-col gap-4 px-6 py-5">
          {serverError ? <FormBanner message={serverError} /> : null}

          <div>
            <Label htmlFor="dept-name" className="mb-1.5">Department Name</Label>
            <Input id="dept-name" aria-invalid={Boolean(errors.name)} {...register("name")} />
            <FieldError message={errors.name?.message} />
          </div>

          <div>
            <Label className="mb-1.5">Department Head (optional)</Label>
            <Controller
              control={control}
              name="managerId"
              render={({ field }) => (
                <Select value={field.value ?? "NONE"} onValueChange={(v) => field.onChange(v === "NONE" ? undefined : v)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No manager assigned</SelectItem>
                    {employeesPage?.data.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {isEdit ? "Save Changes" : "Create Department"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
