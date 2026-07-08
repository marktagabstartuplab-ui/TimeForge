"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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

/**
 * BACKEND GAP — Leave management has no API module yet (no /leave endpoints,
 * no balance or request models). This drawer is a design-complete,
 * validation-complete UI; submission stays disabled until the backend ships.
 */
const BALANCES: { label: string; value: string }[] = [
  { label: "Annual", value: "—" },
  { label: "Sick", value: "—" },
  { label: "Personal", value: "—" },
];

interface RequestLeaveDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestLeaveDrawer({ open, onOpenChange }: RequestLeaveDrawerProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LeaveRequestValues>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: { leaveType: "", startDate: "", endDate: "", reason: "" },
  });

  // Validation runs so the form UX is demonstrably complete; the actual
  // submit is a no-op until a leave endpoint exists.
  const onSubmit = () => undefined;

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
            <div
              role="status"
              className="flex items-start gap-2 rounded-[10px] border border-brand/20 bg-brand-cyan/10 p-3 text-[13px] text-brand-navy"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <span>
                Leave management is not available yet — the backend has no leave module. This form
                will activate once the API ships.
              </span>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[1px] text-brand-muted">
                Your Balances
              </p>
              <div className="grid grid-cols-3 gap-3">
                {BALANCES.map((b) => (
                  <div
                    key={b.label}
                    className="flex flex-col items-center gap-1 rounded-[12px] border border-[#c3c6d2]/50 bg-[#f0eff0] px-3 py-4"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">
                      {b.label}
                    </span>
                    <span className="text-2xl font-bold text-brand-muted/60">{b.value}</span>
                  </div>
                ))}
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
                title="File upload requires the leave backend"
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
              aria-disabled="true"
              title="Unavailable — leave backend not implemented"
              className="cursor-not-allowed rounded-[10px] bg-brand px-6 py-2.5 text-sm font-bold text-white opacity-70"
            >
              Submit Request
            </button>
          </div>
        </form>
      </SheetContent>
    </Dialog>
  );
}
