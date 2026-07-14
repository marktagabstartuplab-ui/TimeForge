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
  uploadLeaveAttachment,
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
  // Set once the request is created — unlocks the attachment step ("attach after create").
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [attachedName, setAttachedName] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

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
      setCreatedRequestId(null);
      setAttachedName(null);
      setAttachError(null);
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
    onSuccess: (created) => {
      setErrorMessage(null);
      setSuccessMessage("Leave request submitted. You can attach a document below (optional).");
      setCreatedRequestId(created.id);
      queryClient.invalidateQueries({ queryKey: ["leave"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
    onError: (err) => {
      setErrorMessage(err instanceof ApiError ? err.message : "Failed to submit leave request.");
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadLeaveAttachment(createdRequestId!, file),
    onSuccess: (_res, file) => {
      setAttachError(null);
      setAttachedName(file.name);
      queryClient.invalidateQueries({ queryKey: ["leave"] });
    },
    onError: (err) => {
      setAttachError(err instanceof ApiError ? err.message : "Failed to upload attachment.");
    },
  });

  const onSubmit = (values: LeaveRequestValues) => mutation.mutate(values);

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = "";
  };

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
              <FieldLabel htmlFor="leave-attachments">Attachment (Optional)</FieldLabel>
              {createdRequestId ? (
                attachedName ? (
                  <div className="flex items-center justify-between gap-2 rounded-[12px] border border-[#c3c6d2] bg-white px-4 py-3 text-sm">
                    <span className="truncate text-brand-ink">{attachedName}</span>
                    <span className="shrink-0 text-xs font-semibold text-green-600">Attached ✓</span>
                  </div>
                ) : (
                  <label
                    htmlFor="leave-attachments"
                    className="flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed border-[#c3c6d2] bg-white px-6 py-8 text-center hover:border-brand"
                  >
                    <CloudUpload className="h-6 w-6 text-brand" aria-hidden="true" />
                    <span className="text-[13px] font-medium text-brand-ink">
                      {uploadMutation.isPending ? "Uploading…" : "Click to upload (PDF, image, or Word, ≤10 MB)"}
                    </span>
                    <input
                      id="leave-attachments"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                      className="sr-only"
                      onChange={onFilePicked}
                      disabled={uploadMutation.isPending}
                    />
                  </label>
                )
              ) : (
                <div
                  aria-disabled="true"
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed border-[#c3c6d2] bg-[#f6f3f4] px-6 py-8 text-center"
                >
                  <CloudUpload className="h-6 w-6 text-brand-muted" aria-hidden="true" />
                  <span className="text-[13px] font-medium text-brand-muted">
                    Submit the request first, then attach a document here.
                  </span>
                </div>
              )}
              {attachError ? <FieldError message={attachError} /> : null}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#c3c6d2]/50 bg-white px-6 py-4">
            {createdRequestId ? (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-[10px] bg-brand px-6 py-2.5 text-sm font-bold text-white transition-opacity hover:bg-[#1467d6]"
              >
                Done
              </button>
            ) : (
            <>
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
            </>
            )}
          </div>
        </form>
      </SheetContent>
    </Dialog>
  );
}
