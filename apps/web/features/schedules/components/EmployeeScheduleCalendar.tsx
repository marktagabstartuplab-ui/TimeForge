"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { todayInOrgTimeZone } from "@/lib/time";
import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, X, Loader2, CalendarPlus, Bell, Briefcase, FileText, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCalendar,
  getCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  type ShiftRow,
  type EmployeeCalendarEvent,
  type EmployeeCalendarEventType,
  type CreateCalendarEventPayload,
} from "../api/schedules.service";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EVENT_TYPE_CONFIG: Record<
  EmployeeCalendarEventType,
  { label: string; chipClass: string; dotClass: string; Icon: React.ElementType }
> = {
  REMINDER: {
    label: "Reminder",
    chipClass: "border-violet-300 bg-violet-50 text-violet-700",
    dotClass: "bg-violet-500",
    Icon: Bell,
  },
  APPOINTMENT: {
    label: "Appointment",
    chipClass: "border-amber-300 bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
    Icon: Briefcase,
  },
  LEAVE_REQUEST: {
    label: "Leave Request",
    chipClass: "border-rose-300 bg-rose-50 text-rose-700",
    dotClass: "bg-rose-500",
    Icon: FileText,
  },
};

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function weekStartOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function weeksInMonth(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const starts: string[] = [];
  let cursor = weekStartOf(first);
  const lastWeekStart = weekStartOf(last);
  while (cursor <= lastWeekStart) {
    starts.push(cursor);
    const d = new Date(cursor);
    d.setUTCDate(d.getUTCDate() + 7);
    cursor = d.toISOString().slice(0, 10);
  }
  return starts;
}

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const MONTH_LABEL = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric" });

interface ShiftByDate {
  [date: string]: (ShiftRow & { conflict: boolean })[];
}

// ── Add / Edit Event Modal ────────────────────────────────────────────────────

interface EventModalProps {
  prefillDate: string;
  editing: EmployeeCalendarEvent | null;
  onClose: () => void;
  onSaved: () => void;
}

function EventModal({ prefillDate, editing, onClose, onSaved }: EventModalProps) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [eventType, setEventType] = useState<EmployeeCalendarEventType>(
    editing?.eventType ?? "REMINDER"
  );
  const [eventDate, setEventDate] = useState(editing?.eventDate ?? prefillDate);
  const [startTime, setStartTime] = useState(
    editing?.startTime ? new Date(editing.startTime).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" }) : ""
  );
  const [endTime, setEndTime] = useState(
    editing?.endTime ? new Date(editing.endTime).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" }) : ""
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState("");

  const queryClient = useQueryClient();

  function buildDateTime(date: string, time: string): string | undefined {
    if (!time) return undefined;
    return new Date(`${date}T${time}:00`).toISOString();
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title is required");
      const payload: CreateCalendarEventPayload = {
        title: title.trim(),
        eventType,
        eventDate,
        startTime: buildDateTime(eventDate, startTime),
        endTime: buildDateTime(eventDate, endTime),
        notes: notes.trim() || undefined,
      };
      if (editing) {
        await updateCalendarEvent(editing.id, { ...payload, version: editing.version });
      } else {
        await createCalendarEvent(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      onSaved();
      onClose();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not save event");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCalendarEvent(editing!.id, editing!.version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not delete event");
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <CalendarPlus className="h-4 w-4" />
            </span>
            <h3 className="text-lg font-bold text-brand-navy">
              {editing ? "Edit Event" : "Add Event"}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="text-brand-muted hover:text-brand-ink rounded-lg p-1 hover:bg-[#f6f3f4]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-brand-muted block mb-1.5">
              Event Title <span className="text-red-500">*</span>
            </label>
            <input
              id="cal-event-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Doctor's appointment"
              className="w-full h-10 rounded-lg border border-[#c3c6d2] px-3 text-sm focus:border-brand outline-none"
            />
          </div>

          {/* Event Type */}
          <div>
            <label className="text-xs font-semibold text-brand-muted block mb-1.5">Type</label>
            <div className="flex gap-2 flex-wrap">
              {(["REMINDER", "APPOINTMENT", "LEAVE_REQUEST"] as EmployeeCalendarEventType[]).map((t) => {
                const cfg = EVENT_TYPE_CONFIG[t];
                return (
                  <button
                    key={t}
                    type="button"
                    id={`cal-event-type-${t.toLowerCase()}`}
                    onClick={() => setEventType(t)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                      eventType === t ? cfg.chipClass + " ring-2 ring-offset-1 ring-brand/30" : "border-[#c3c6d2]/60 bg-white text-brand-muted hover:bg-[#f6f3f4]"
                    )}
                  >
                    <cfg.Icon className="h-3 w-3" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs font-semibold text-brand-muted block mb-1.5">Date</label>
            <input
              id="cal-event-date"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full h-10 rounded-lg border border-[#c3c6d2] px-3 text-sm focus:border-brand outline-none"
            />
          </div>

          {/* Start / End Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-brand-muted block mb-1.5">Start Time <span className="text-brand-muted font-normal">(optional)</span></label>
              <input
                id="cal-event-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#c3c6d2] px-3 text-sm focus:border-brand outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-brand-muted block mb-1.5">End Time <span className="text-brand-muted font-normal">(optional)</span></label>
              <input
                id="cal-event-end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full h-10 rounded-lg border border-[#c3c6d2] px-3 text-sm focus:border-brand outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-brand-muted block mb-1.5">Notes <span className="text-brand-muted font-normal">(optional)</span></label>
            <textarea
              id="cal-event-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Additional details..."
              className="w-full rounded-lg border border-[#c3c6d2] px-3 py-2 text-sm focus:border-brand outline-none resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#c3c6d2]/30 pt-4">
          <div>
            {editing && (
              <button
                type="button"
                id="cal-event-delete"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 h-9 rounded-lg px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saveMutation.isPending}
              className="h-9 rounded-lg border border-[#c3c6d2] px-4 text-sm font-semibold text-brand-navy hover:bg-[#f6f3f4] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              id="cal-event-save"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 h-9 rounded-lg bg-brand px-5 text-sm font-bold text-white hover:bg-[#1467d6] disabled:opacity-60"
            >
              {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editing ? "Save Changes" : "Add Event"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Calendar Component ────────────────────────────────────────────────────

export function EmployeeScheduleCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<EmployeeCalendarEvent | null>(null);

  const weekStarts = useMemo(() => weeksInMonth(year, month), [year, month]);

  const weekQueries = useQueries({
    queries: weekStarts.map((ws) => ({
      queryKey: ["schedules", "calendar", ws],
      queryFn: () => getCalendar({ weekStart: ws }),
      refetchInterval: 5_000,
      refetchOnWindowFocus: true,
    })),
  });

  // Derive from/to for the visible month (+1 day buffer on each side).
  const monthFrom = useMemo(() => `${year}-${String(month + 1).padStart(2, "0")}-01`, [year, month]);
  const monthTo = useMemo(() => {
    const last = endOfMonth(new Date(Date.UTC(year, month, 1)));
    return last.toISOString().slice(0, 10);
  }, [year, month]);

  const { data: calendarEvents = [], refetch: refetchEvents } = useQuery({
    queryKey: ["calendar-events", year, month],
    queryFn: () => getCalendarEvents({ from: monthFrom, to: monthTo }),
    refetchOnWindowFocus: true,
  });

  const queryClient = useQueryClient();
  useEffect(() => {
    for (let offset = 1; offset <= 2; offset++) {
      const futureMonth = (month + offset) % 12;
      const futureYear = year + Math.floor((month + offset) / 12);
      const futureWeeks = weeksInMonth(futureYear, futureMonth);
      futureWeeks.forEach((ws) => {
        queryClient.prefetchQuery({
          queryKey: ["schedules", "calendar", ws],
          queryFn: () => getCalendar({ weekStart: ws }),
          staleTime: 10_000,
        });
      });
    }
  }, [year, month, queryClient]);

  const isLoading = weekQueries.some((q) => q.isLoading);

  // Merge shifts into date-keyed map.
  const shiftsByDate: ShiftByDate = useMemo(() => {
    const map: ShiftByDate = {};
    for (const q of weekQueries) {
      if (!q.data) continue;
      for (const emp of q.data.employees) {
        for (const s of emp.shifts) {
          const key = s.shiftDate.slice(0, 10);
          if (!map[key]) map[key] = [];
          map[key].push(s as ShiftByDate[string][number]);
        }
      }
    }
    return map;
  }, [weekQueries]);

  // Calendar events keyed by date.
  const eventsByDate = useMemo(() => {
    const map: Record<string, EmployeeCalendarEvent[]> = {};
    for (const e of calendarEvents) {
      if (!map[e.eventDate]) map[e.eventDate] = [];
      map[e.eventDate].push(e);
    }
    return map;
  }, [calendarEvents]);

  const todayStr = todayInOrgTimeZone();
  const firstDay = startOfMonth(new Date(Date.UTC(year, month, 1)));
  const lastDay = endOfMonth(new Date(Date.UTC(year, month, 1)));
  const startDow = (firstDay.getUTCDay() + 6) % 7;
  const totalDays = lastDay.getUTCDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  const openAdd = useCallback((dateStr: string) => {
    setEditingEvent(null);
    setModalDate(dateStr);
  }, []);

  const openEdit = useCallback((e: EmployeeCalendarEvent) => {
    setEditingEvent(e);
    setModalDate(null);
  }, []);

  const closeModal = useCallback(() => {
    setModalDate(null);
    setEditingEvent(null);
  }, []);

  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      {/* Month navigator + Add Event button */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Previous month"
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-brand-muted hover:bg-[#f6f3f4]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-bold text-brand-ink">{MONTH_LABEL(year, month)}</span>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="Next month"
          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-brand-muted hover:bg-[#f6f3f4]"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <button
          type="button"
          id="cal-add-event-btn"
          onClick={() => openAdd(todayStr)}
          className="ml-auto flex items-center gap-1.5 rounded-[10px] bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-[#1467d6] transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Event
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-brand-muted py-8 text-center">Loading schedule…</p>
      ) : (
        <div className="grid grid-cols-7 gap-px bg-[#c3c6d2]/30 rounded-[12px] overflow-hidden border border-[#c3c6d2]/30">
          {/* Day headers */}
          {DAY_NAMES.map((name) => (
            <div key={name} className="bg-[#f6f3f4] px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-brand-muted">
              {name}
            </div>
          ))}

          {/* Day cells */}
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="bg-white min-h-[90px]" />;
            }
            const dateStr = toDateStr(year, month, day);
            const isToday = dateStr === todayStr;
            const dayShifts = shiftsByDate[dateStr] ?? [];
            const dayEvents = eventsByDate[dateStr] ?? [];

            return (
              <div
                key={dateStr}
                className={cn(
                  "bg-white min-h-[90px] px-1.5 py-1 flex flex-col gap-0.5 group relative",
                  isToday && "bg-brand/5",
                )}
              >
                {/* Date number + hover add */}
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                      isToday ? "bg-brand text-white" : "text-brand-ink",
                    )}
                  >
                    {day}
                  </span>
                  <button
                    type="button"
                    id={`cal-add-event-${dateStr}`}
                    onClick={() => openAdd(dateStr)}
                    aria-label={`Add event on ${dateStr}`}
                    className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-brand/10 text-brand hover:bg-brand/20 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>

                {/* Shift chips */}
                {dayShifts.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "rounded-[5px] border px-1.5 py-0.5 text-[9px] font-semibold leading-tight",
                      s.status === "DRAFT"
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-[#c3c6d2]/60 bg-[#f0fdf4] text-[#16a34a]",
                    )}
                  >
                    {formatHour(s.startTime)} – {formatHour(s.endTime)}
                  </div>
                ))}

                {/* Personal event chips */}
                {dayEvents.map((ev) => {
                  const cfg = EVENT_TYPE_CONFIG[ev.eventType];
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => openEdit(ev)}
                      title={ev.title}
                      className={cn(
                        "flex items-center gap-1 rounded-[5px] border px-1.5 py-0.5 text-[9px] font-semibold leading-tight w-full text-left hover:brightness-95 transition-all",
                        cfg.chipClass,
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", cfg.dotClass)} />
                      <span className="truncate">{ev.title}</span>
                      <Pencil className="h-2 w-2 shrink-0 opacity-50 ml-auto" />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3 px-1">
        <div className="flex items-center gap-1.5 text-[10px] text-brand-muted">
          <span className="h-2 w-2 rounded-sm border border-[#c3c6d2]/60 bg-[#f0fdf4]" />
          Shift
        </div>
        {(["REMINDER", "APPOINTMENT", "LEAVE_REQUEST"] as EmployeeCalendarEventType[]).map((t) => {
          const cfg = EVENT_TYPE_CONFIG[t];
          return (
            <div key={t} className="flex items-center gap-1.5 text-[10px] text-brand-muted">
              <span className={cn("h-2 w-2 rounded-full", cfg.dotClass)} />
              {cfg.label}
            </div>
          );
        })}
      </div>

      {/* Add / Edit Modal */}
      {(modalDate !== null || editingEvent !== null) && (
        <EventModal
          prefillDate={modalDate ?? editingEvent!.eventDate}
          editing={editingEvent}
          onClose={closeModal}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["calendar-events"] })}
        />
      )}
    </div>
  );
}
