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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldError, FormBanner } from "@/features/auth/components/FormMessages";
import { ApiError } from "@/lib/api/client";
import { listClients } from "@/features/time-tracking/api/catalog.service";
import { projectSchema, type ProjectValues } from "../schemas/org-management.schema";
import { createProject, updateProject, type DepartmentRow, type ProjectRow } from "../api/org-management.service";
import type { ToastState } from "@/components/shared/Toast";

const STATUSES = [
  { value: "ON_TRACK", label: "On Track" },
  { value: "AT_RISK", label: "At Risk" },
  { value: "DELAYED", label: "Delayed" },
] as const;

export function CreateProjectModal({
  open,
  onOpenChange,
  project,
  departments,
  onToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectRow | null;
  departments: DepartmentRow[];
  onToast: (t: ToastState) => void;
}) {
  const isEdit = Boolean(project);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: clients } = useQuery({ queryKey: ["org-management", "clients"], queryFn: listClients, enabled: open });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProjectValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: { name: "", code: "", departmentId: "", clientId: undefined, status: "ON_TRACK", billable: true },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: project?.name ?? "",
        code: project?.code ?? "",
        departmentId: project?.department?.id ?? "",
        clientId: project?.client?.id ?? undefined,
        status: project?.status ?? "ON_TRACK",
        billable: project?.billable ?? true,
      });
    }
  }, [open, project, reset]);

  const submit = useMutation({
    mutationFn: (values: ProjectValues) =>
      isEdit
        ? updateProject(project!.id, { ...values, clientId: values.clientId || undefined, version: project!.version })
        : createProject({ ...values, clientId: values.clientId || undefined }),
    onSuccess: () => {
      onToast({ message: isEdit ? "Project updated." : "Project created.", tone: "success" });
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
            <DialogTitle>{isEdit ? "Edit Project" : "Create Project"}</DialogTitle>
            <DialogDescription>{isEdit ? "Update project details." : "Add a new project under a department."}</DialogDescription>
          </div>
          <DialogCloseButton />
        </div>
        <form onSubmit={handleSubmit((values) => submit.mutate(values))} noValidate className="flex flex-col gap-4 px-6 py-5">
          {serverError ? <FormBanner message={serverError} /> : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="proj-name" className="mb-1.5">Project Name</Label>
              <Input id="proj-name" aria-invalid={Boolean(errors.name)} {...register("name")} />
              <FieldError message={errors.name?.message} />
            </div>
            <div>
              <Label htmlFor="proj-code" className="mb-1.5">Code</Label>
              <Input id="proj-code" aria-invalid={Boolean(errors.code)} {...register("code")} />
              <FieldError message={errors.code?.message} />
            </div>
          </div>

          <div>
            <Label className="mb-1.5">Department</Label>
            <Controller
              control={control}
              name="departmentId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select a department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.departmentId?.message} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5">Client (optional)</Label>
              <Controller
                control={control}
                name="clientId"
                render={({ field }) => (
                  <Select value={field.value ?? "NONE"} onValueChange={(v) => field.onChange(v === "NONE" ? undefined : v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">No client</SelectItem>
                      {clients?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div>
              <Label className="mb-1.5">Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <Controller
            control={control}
            name="billable"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm text-brand-ink">
                <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(Boolean(c))} />
                Billable project
              </label>
            )}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {isEdit ? "Save Changes" : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
