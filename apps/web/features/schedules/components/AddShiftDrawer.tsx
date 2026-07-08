"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { listEmployees } from "@/features/employee-management/api/employee-management.service";
import { listDepartments } from "../api/departments-picker.service";
import { createShift, createShiftDraft, type ShiftType } from "../api/schedules.service";
import type { ToastState } from "@/components/shared/Toast";

const SHIFT_TYPES: { label: string; value: ShiftType }[] = [
  { label: "Morning", value: "MORNING" },
  { label: "Afternoon", value: "AFTERNOON" },
  { label: "Night", value: "NIGHT" },
  { label: "Custom", value: "CUSTOM" },
];

const MAX_SHIFT_HOURS = 16;
const BREAK_ELIGIBLE_HOURS = 6;
const BREAK_MINUTES = 30;

function computeShiftSummary(date: string, startTime: string, endTime: string) {
  if (!date || !startTime || !endTime) return null;
  const start = new Date(`${date}T${startTime}`);
  const end = new Date(`${date}T${endTime}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  if (end <= start) {
    return { error: "End time must be after start time." } as const;
  }
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  if (hours > MAX_SHIFT_HOURS) {
    return { error: `A single shift cannot exceed ${MAX_SHIFT_HOURS} hours.` } as const;
  }
  const breakMinutes = hours > BREAK_ELIGIBLE_HOURS ? BREAK_MINUTES : 0;
  return { hours, breakMinutes } as const;
}

interface AddShiftDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToast: (t: ToastState) => void;
}

export function AddShiftDrawer({ open, onOpenChange, onToast }: AddShiftDrawerProps) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [shiftType, setShiftType] = useState<ShiftType>("MORNING");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: employees } = useQuery({ queryKey: ["employees", "picker"], queryFn: () => listEmployees({ limit: 100 }), enabled: open });
  const { data: departments } = useQuery({ queryKey: ["departments", "picker"], queryFn: listDepartments, enabled: open });

  const reset = () => {
    setUserId("");
    setDepartmentId("");
    setDate("");
    setStartTime("");
    setEndTime("");
    setShiftType("MORNING");
    setNotes("");
    setError(null);
  };

  const summary = computeShiftSummary(date, startTime, endTime);

  const save = useMutation({
    mutationFn: (publish: boolean) => {
      const payload = {
        userId,
        departmentId: departmentId || undefined,
        shiftDate: date,
        startTime: new Date(`${date}T${startTime}`).toISOString(),
        endTime: new Date(`${date}T${endTime}`).toISOString(),
        shiftType,
        notes: notes || undefined,
      };
      return publish ? createShift({ ...payload, publish: "true" }) : createShiftDraft(payload);
    },
    onSuccess: (_, publish) => {
      onToast({ message: publish ? "Shift published." : "Draft saved.", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      reset();
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save the shift."),
  });

  const canSubmit = Boolean(userId && date && startTime && endTime && summary && !("error" in summary));

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <SheetContent aria-describedby={undefined}>
        <div className="flex items-center justify-between border-b border-[#c3c6d2]/50 bg-[#f6f3f4] px-6 py-4">
          <DialogTitle>Add Shift</DialogTitle>
          <DialogCloseButton />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {error ? (
              <p role="alert" className="rounded-[8px] bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </p>
            ) : null}

            <div>
              <FieldLabel htmlFor="shift-employee">Employee</FieldLabel>
              <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
                <SelectTrigger id="shift-employee" className="h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {(employees?.data ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <FieldLabel htmlFor="shift-date">Date</FieldLabel>
              <IconInput id="shift-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="shift-start">Start Time</FieldLabel>
                <IconInput id="shift-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="shift-end">End Time</FieldLabel>
                <IconInput id="shift-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="shift-department">Department</FieldLabel>
              <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? "")}>
                <SelectTrigger id="shift-department" className="h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]">
                  <SelectValue placeholder="Select department (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {(departments ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <FieldLabel htmlFor="shift-type">Shift Type</FieldLabel>
              <Select value={shiftType} onValueChange={(v) => setShiftType(v as ShiftType)}>
                <SelectTrigger id="shift-type" className="h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {summary && "error" in summary ? (
              <p role="alert" className="rounded-[8px] bg-red-50 px-3 py-2 text-xs text-red-600">
                {summary.error}
              </p>
            ) : summary ? (
              <div className="flex items-start gap-2 rounded-[8px] bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
                <span aria-hidden className="mt-0.5">ℹ</span>
                <span>
                  This shift totals {summary.hours.toFixed(1)} working hours
                  {summary.breakMinutes > 0 ? ` excluding a ${summary.breakMinutes}-minute unpaid break.` : "."}
                </span>
              </div>
            ) : null}

            <div>
              <FieldLabel htmlFor="shift-notes">Notes</FieldLabel>
              <Textarea id="shift-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes for this shift…" />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#c3c6d2]/50 bg-white px-6 py-4">
            <DialogClose className="rounded-[10px] px-5 py-2.5 text-sm font-bold text-brand-ink hover:bg-[#f6f3f4]">
              Cancel
            </DialogClose>
            <button
              type="button"
              onClick={() => save.mutate(false)}
              disabled={!canSubmit || save.isPending}
              className="flex items-center gap-2 rounded-[10px] border border-[#c3c6d2] px-5 py-2.5 text-sm font-bold text-brand-ink hover:bg-[#f6f3f4] disabled:opacity-50"
            >
              {save.isPending && save.variables === false ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => save.mutate(true)}
              disabled={!canSubmit || save.isPending}
              className="flex items-center gap-2 rounded-[10px] bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-[#1467d6] disabled:opacity-50"
            >
              {save.isPending && save.variables === true ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Publish Shift
            </button>
          </div>
        </div>
      </SheetContent>
    </Dialog>
  );
}
