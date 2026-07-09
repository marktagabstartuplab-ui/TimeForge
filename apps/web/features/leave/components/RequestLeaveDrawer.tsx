"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, Info } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogCloseButton,
  DialogTitle,
  SheetContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldLabel, IconInput } from "@/features/auth/components/fields";
import { FieldError } from "@/features/auth/components/FormMessages";
import { Textarea } from "@/components/ui/textarea";
import { leaveRequestSchema, LEAVE_TYPES, type LeaveRequestValues } from "../schemas/leave.schema";
import { ApiError } from "@/lib/api/client";
import {
  createLeaveRequest,
  getLeaveBalances,
  type LeaveType,
} from "../api/leave.service";

const BALANCE_LABELS: Record<LeaveType, string> = {
  ANNUAL: "Annual",
  SICK: "Sick",
  PERSONAL: "Personal",
};

interface RequestLeaveDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestLeaveDrawer({ open, onOpenChange }: RequestLeaveDrawerProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data: balances } = useQuery({
    queryKey: ["leave", "balances"],
    queryFn: getLeaveBalances,
    enabled: open,
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LeaveRequestValues>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: { leaveType: "", startDate: "", endDate: "", reason: "" },
  });

  useEffect(() => {
    if (open) {
      reset({ leaveType: "", startDate: "", endDate: "", reason: "" });
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (values: LeaveRequestValues) =>
      createLeaveRequest({
        type: values.leaveType as LeaveType,
        startDate: values.startDate,
        endDate: values.endDate,
        reason: values.reason,
      }),
    onSuccess: () => {
      setErrorMessage(null);
      setSuccessMessage("Leave request submitted for approval.");
      queryClient.invalidateQueries({ queryKey: ["leave"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
      setTimeout(() => onOpenChange(false), 1200);
    },
    onError: (err) => {
      setErrorMessage(err instanceof ApiError ? err.message : "Failed to submit leave request.");
    },
  });

  const onSubmit = (values: LeaveRequestValues) => mutation.mutate(values);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined}>
        <div className="flex items-center justify-between border-b border-[#c3c6d2]/50 bg-[#f6f3f4] px-6 py-4">
          <DialogTitle>Request Leave</DialogTitle>
          <DialogCloseButton />
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-[10px] border border-red-300 bg-red-50 p-3 text-[13px] text-red-700"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}
            {successMessage && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-[10px] border border-brand/20 bg-brand-cyan/10 p-3 text-[13px] text-brand-navy"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <span>{successMessage}</span>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[1px] text-brand-muted">
                Your Balances
              </p>
              <div className="grid grid-cols-3 gap-3">
                {LEAVE_TYPES.map((t) => {
                  const balance = balances?.find((b) => b.type === t.value);
                  return (
                    <div
                      key={t.value}
                      className="flex flex-col items-center gap-1 rounded-[12px] border border-[#c3c6d2]/50 bg-[#f0eff0] px-3 py-4"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">
                        {BALANCE_LABELS[t.value as LeaveType]}
                      </span>
                      <span className="text-2xl font-bold text-brand-navy">
                        {balance ? balance.remainingDays : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="leave-type">Leave Type</FieldLabel>
              <Controller
                control={control}
                name="leaveType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="leave-type"
                      aria-label="Leave Type"
                      aria-invalid={Boolean(errors.leaveType)}
                      className="h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]"
                    >
                      <SelectValue placeholder="Select Leave Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAVE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.leaveType?.message} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="leave-start">Start Date</FieldLabel>
                <IconInput
                  id="leave-start"
                  type="date"
                  invalid={Boolean(errors.startDate)}
                  {...register("startDate")}
                />
                <FieldError message={errors.startDate?.message} />
              </div>
              <div>
                <FieldLabel htmlFor="leave-end">End Date</FieldLabel>
                <IconInput
                  id="leave-end"
                  type="date"
                  invalid={Boolean(errors.endDate)}
                  {...register("endDate")}
                />
                <FieldError message={errors.endDate?.message} />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="leave-reason">Reason for Leave</FieldLabel>
              <Textarea
                id="leave-reason"
                rows={4}
                placeholder="Briefly describe the reason..."
                invalid={Boolean(errors.reason)}
                {...register("reason")}
              />
              <FieldError message={errors.reason?.message} />
            </div>

            <div>
              <FieldLabel htmlFor="leave-attachments">Attachments (Optional)</FieldLabel>
              <button
                type="button"
                id="leave-attachments"
                aria-disabled="true"
                title="Attachment upload is coming soon"
                className="flex w-full cursor-not-allowed flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed border-[#c3c6d2] bg-white px-6 py-8 text-center"
              >
                <CloudUpload className="h-6 w-6 text-brand" aria-hidden="true" />
                <span className="text-[13px] font-medium text-brand-ink">
                  Click to upload or drag and drop
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#c3c6d2]/50 bg-white px-6 py-4">
            <DialogClose className="rounded-[10px] px-5 py-2.5 text-sm font-bold text-brand-ink hover:bg-[#f6f3f4]">
              Cancel
            </DialogClose>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-[10px] bg-brand px-6 py-2.5 text-sm font-bold text-white transition-opacity hover:bg-[#1467d6] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {mutation.isPending ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Dialog>
  );
}
