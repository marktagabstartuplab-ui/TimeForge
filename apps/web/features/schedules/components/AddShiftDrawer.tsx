"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
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

const DRAFT_KEY = "timeforge.shift-add-draft";

interface ShiftDraft {
  userId: string;
  departmentId: string;
  date: string;
  startTime: string;
  endTime: string;
  shiftType: ShiftType;
  notes: string;
}

function saveLocalDraft(data: ShiftDraft) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  }
}

function readLocalDraft(): ShiftDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearLocalDraft() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(DRAFT_KEY);
  }
}

interface AddShiftDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToast: (t: ToastState) => void;
  managedDeptIds?: string[];
}

export function AddShiftDrawer({ open, onOpenChange, onToast, managedDeptIds }: AddShiftDrawerProps) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [shiftType, setShiftType] = useState<ShiftType>("MORNING");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Recurrence states
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(4);

  // Weekday selection states
  const [selectedWeekdays, setSelectedWeekdays] = useState<{ [key: string]: boolean }>({
    Mon: false,
    Tue: false,
    Wed: false,
    Thu: false,
    Fri: false,
    Sat: false,
    Sun: false,
  });

  const { data: employees } = useQuery({ queryKey: ["employees", "picker"], queryFn: () => listEmployees({ limit: 100 }), enabled: open });
  const { data: departments } = useQuery({ queryKey: ["departments", "picker"], queryFn: listDepartments, enabled: open });

  const visibleDepartments = managedDeptIds
    ? (departments ?? []).filter((d) => managedDeptIds.includes(d.id))
    : departments ?? [];
  const visibleEmployees = managedDeptIds
    ? (employees?.data ?? []).filter((e) => e.departmentId && managedDeptIds.includes(e.departmentId))
    : employees?.data ?? [];
  const singleDept = visibleDepartments.length === 1 ? visibleDepartments[0].id : null;

  const reset = () => {
    setUserId("");
    setDepartmentId(singleDept ?? "");
    setDate("");
    setStartTime("");
    setEndTime("");
    setShiftType("MORNING");
    setNotes("");
    setError(null);
    setRepeatWeekly(false);
    setRepeatWeeks(4);
    setSelectedWeekdays({
      Mon: false,
      Tue: false,
      Wed: false,
      Thu: false,
      Fri: false,
      Sat: false,
      Sun: false,
    });
  };

  useEffect(() => {
    if (open) {
      const draft = readLocalDraft();
      if (draft) {
        setUserId(draft.userId ?? "");
        setDepartmentId(draft.departmentId ?? (singleDept ?? ""));
        setDate(draft.date ?? "");
        setStartTime(draft.startTime ?? "");
        setEndTime(draft.endTime ?? "");
        setShiftType(draft.shiftType ?? "MORNING");
        setNotes(draft.notes ?? "");
        setRepeatWeekly(false);
        setRepeatWeeks(4);
      } else {
        reset();
      }
    }
  }, [open, singleDept]);

  // Set the default checked weekday when the date input changes
  useEffect(() => {
    if (date) {
      const parts = date.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const parsedDate = new Date(year, month, day);
      if (!Number.isNaN(parsedDate.getTime())) {
        const dayOfWeekIndex = parsedDate.getDay(); // 0 = Sunday, 1 = Monday, ...
        const weekdayKeys = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const selectedKey = weekdayKeys[dayOfWeekIndex];

        setSelectedWeekdays((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((key) => {
            next[key] = (key === selectedKey);
          });
          return next;
        });
      }
    }
  }, [date]);

  useEffect(() => {
    if (singleDept && open && !departmentId) setDepartmentId(singleDept);
  }, [singleDept, open, departmentId]);

  const summary = computeShiftSummary(date, startTime, endTime);

  // Helper to resolve actual calendar date strings for each checked weekday in the week containing the baseDate
  const getWeekdayDatesInWeek = (baseDateStr: string, checkedDays: { [key: string]: boolean }) => {
    const parts = baseDateStr.split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const baseDate = new Date(year, month, day);

    const dayOfWeek = baseDate.getDay(); // 0 = Sunday, 1 = Monday, ...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(year, month, day + diffToMonday);

    const weekdayKeys = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dates: string[] = [];

    weekdayKeys.forEach((key, index) => {
      if (checkedDays[key]) {
        const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
        const yearStr = d.getFullYear();
        const monthStr = String(d.getMonth() + 1).padStart(2, "0");
        const dayStr = String(d.getDate()).padStart(2, "0");
        dates.push(`${yearStr}-${monthStr}-${dayStr}`);
      }
    });

    return dates;
  };

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const checkedDates = getWeekdayDatesInWeek(date, selectedWeekdays);
      const totalWeeks = repeatWeekly ? repeatWeeks : 1;
      const results = [];

      for (const baseDateStr of checkedDates) {
        for (let i = 0; i < totalWeeks; i++) {
          const parts = baseDateStr.split("-");
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);

          const currentDate = new Date(year, month, day + i * 7);
          const yearStr = currentDate.getFullYear();
          const monthStr = String(currentDate.getMonth() + 1).padStart(2, "0");
          const dayStr = String(currentDate.getDate()).padStart(2, "0");
          const dateStr = `${yearStr}-${monthStr}-${dayStr}`;

          const payload = {
            userId,
            departmentId: departmentId || undefined,
            shiftDate: dateStr,
            startTime: new Date(`${dateStr}T${startTime}`).toISOString(),
            endTime: new Date(`${dateStr}T${endTime}`).toISOString(),
            shiftType,
            notes: notes || undefined,
          };

          const res = publish
            ? await createShift({ ...payload, publish: "true" })
            : await createShiftDraft(payload);
          results.push(res);
        }
      }
      return results;
    },
    onSuccess: (_, publish) => {
      const checkedDates = getWeekdayDatesInWeek(date, selectedWeekdays);
      const totalShifts = checkedDates.length * (repeatWeekly ? repeatWeeks : 1);
      onToast({
        message: totalShifts > 1
          ? `${publish ? "Shifts published" : "Drafts saved"} (${totalShifts} shifts generated).`
          : (publish ? "Shift published." : "Draft saved."),
        tone: "success"
      });
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      if (publish) {
        clearLocalDraft();
        reset();
      } else {
        saveLocalDraft({
          userId,
          departmentId,
          date,
          startTime,
          endTime,
          shiftType,
          notes,
        });
      }
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save the shift(s)."),
  });

  const hasSelectedDays = Object.values(selectedWeekdays).some((v) => v);
  const canSubmit = Boolean(userId && date && startTime && endTime && summary && !("error" in summary) && hasSelectedDays);

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
                  <SelectValue placeholder="Select employee">
                    {userId
                      ? (() => {
                          const e = visibleEmployees.find((emp) => emp.id === userId);
                          return e ? `${e.firstName} ${e.lastName}` : undefined;
                        })()
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {visibleEmployees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <FieldLabel htmlFor="shift-date">Date</FieldLabel>
              <IconInput id="shift-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div>
              <FieldLabel htmlFor="shift-weekdays">Assign to Weekdays (Week of the selected date)</FieldLabel>
              <div className="flex flex-wrap gap-2 mt-1.5" id="shift-weekdays">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => {
                  const isChecked = selectedWeekdays[day];
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setSelectedWeekdays((prev) => ({
                          ...prev,
                          [day]: !prev[day],
                        }))
                      }
                      className={cn(
                        "h-9 px-3.5 rounded-[8px] border text-xs font-bold transition-colors select-none",
                        isChecked
                          ? "bg-brand text-white border-brand hover:bg-[#1467d6]"
                          : "bg-white text-[#2a2c35] border-[#c3c6d2] hover:bg-[#f6f3f4]"
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
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

            {!singleDept ? (
            <div>
              <FieldLabel htmlFor="shift-department">Department</FieldLabel>
              <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? "")}>
                <SelectTrigger id="shift-department" className="h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]">
                  <span className="flex flex-1 text-left truncate">
                    {departmentId
                      ? visibleDepartments.find((d) => d.id === departmentId)?.name ?? departmentId
                      : "Select department (optional)"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {visibleDepartments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            ) : null}

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

            <div className="rounded-[10px] border border-[#c3c6d2]/50 bg-[#f8fafc] p-4 space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-brand-navy cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={repeatWeekly}
                  onChange={(e) => setRepeatWeekly(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
                />
                Repeat shift weekly
              </label>

              {repeatWeekly && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-[#5c5f6c] shrink-0">Duration:</span>
                  <Select value={String(repeatWeeks)} onValueChange={(v) => setRepeatWeeks(Number(v))}>
                    <SelectTrigger className="h-9 w-32 rounded-[8px] border-[#c3c6d2] bg-white text-xs px-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 Weeks</SelectItem>
                      <SelectItem value="3">3 Weeks</SelectItem>
                      <SelectItem value="4">4 Weeks</SelectItem>
                      <SelectItem value="6">6 Weeks</SelectItem>
                      <SelectItem value="8">8 Weeks</SelectItem>
                      <SelectItem value="12">12 Weeks</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-[11px] text-[#5c5f6c]">
                    Creates {repeatWeeks} consecutive weekly shifts.
                  </span>
                </div>
              )}
            </div>

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
