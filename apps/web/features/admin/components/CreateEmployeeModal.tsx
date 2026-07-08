"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { createEmployeeSchema, type CreateEmployeeValues } from "../schemas/admin-actions.schema";
import { createEmployee } from "../api/admin-actions.service";
import type { ToastState } from "@/components/shared/Toast";

const ROLES = ["EMPLOYEE", "SUPERVISOR", "HR", "FINANCE", "ADMIN"] as const;
const EMPLOYMENT_TYPES = ["EMPLOYEE", "INTERN", "CONTRACTOR", "PART_TIME", "FULL_TIME"] as const;

export function CreateEmployeeModal({
  open,
  onOpenChange,
  onToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToast: (t: ToastState) => void;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateEmployeeValues>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: { email: "", firstName: "", lastName: "", role: "EMPLOYEE", employmentType: "EMPLOYEE" },
  });

  const submit = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      onToast({ message: "Employee created.", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      reset();
      onOpenChange(false);
    },
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : "Something went wrong");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          setServerError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <DialogTitle>Create Employee</DialogTitle>
            <DialogDescription>Add a new person to the organization.</DialogDescription>
          </div>
          <DialogCloseButton />
        </div>
        <form
          onSubmit={handleSubmit((values) => submit.mutate(values))}
          noValidate
          className="flex flex-col gap-4 px-6 py-5"
        >
          {serverError ? <FormBanner message={serverError} /> : null}

          <div>
            <Label htmlFor="email" className="mb-1.5">Email</Label>
            <Input id="email" type="email" aria-invalid={Boolean(errors.email)} {...register("email")} />
            <FieldError message={errors.email?.message} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="firstName" className="mb-1.5">First Name</Label>
              <Input id="firstName" aria-invalid={Boolean(errors.firstName)} {...register("firstName")} />
              <FieldError message={errors.firstName?.message} />
            </div>
            <div>
              <Label htmlFor="lastName" className="mb-1.5">Last Name</Label>
              <Input id="lastName" aria-invalid={Boolean(errors.lastName)} {...register("lastName")} />
              <FieldError message={errors.lastName?.message} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5">Role</Label>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div>
              <Label className="mb-1.5">Employment Type</Label>
              <Controller
                control={control}
                name="employmentType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Create Employee
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
