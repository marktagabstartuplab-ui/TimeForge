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
import { generatePayrollSchema, type GeneratePayrollValues } from "../schemas/admin-actions.schema";
import { generatePayroll } from "../api/admin-actions.service";
import type { ToastState } from "@/components/shared/Toast";

const PERIOD_TYPES = ["FIRST_HALF", "SECOND_HALF", "CUSTOM"] as const;

export function GeneratePayrollModal({
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
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GeneratePayrollValues>({
    resolver: zodResolver(generatePayrollSchema),
    defaultValues: { type: "FIRST_HALF", startDate: "", endDate: "" },
  });

  const submit = useMutation({
    mutationFn: generatePayroll,
    onSuccess: () => {
      onToast({ message: "Payroll period created and generated.", tone: "success" });
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
            <DialogTitle>Generate Payroll</DialogTitle>
            <DialogDescription>Create a payroll period and generate its report.</DialogDescription>
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
            <Label className="mb-1.5">Period Type</Label>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIOD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="startDate" className="mb-1.5">Start Date</Label>
              <Input id="startDate" type="date" aria-invalid={Boolean(errors.startDate)} {...register("startDate")} />
              <FieldError message={errors.startDate?.message} />
            </div>
            <div>
              <Label htmlFor="endDate" className="mb-1.5">End Date</Label>
              <Input id="endDate" type="date" aria-invalid={Boolean(errors.endDate)} {...register("endDate")} />
              <FieldError message={errors.endDate?.message} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Generate
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
