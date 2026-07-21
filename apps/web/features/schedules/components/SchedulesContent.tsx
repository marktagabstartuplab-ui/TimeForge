"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useAuth } from "@/providers/auth-provider";
import { getCalendar } from "../api/schedules.service";
import { listDepartments } from "../api/departments-picker.service";
import { ScheduleSummaryCards } from "./ScheduleSummaryCards";
import { ScheduleGrid } from "./ScheduleGrid";
import { ScheduleSidebar } from "./ScheduleSidebar";
import { AddShiftDrawer } from "./AddShiftDrawer";
import { EmployeeScheduleCalendar } from "./EmployeeScheduleCalendar";

function startOfIsoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart);
  const end = new Date(weekEnd);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function SchedulesContent() {
  const { user } = useAuth();
  const canManage = user?.roles.some((r) => ["SUPERVISOR", "HR", "ADMIN"].includes(r)) ?? false;
  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek(new Date()));
  const [view, setView] = useState<"week" | "day">("week");
  const [selectedDay, setSelectedDay] = useState(weekStart);
  const [departmentId, setDepartmentId] = useState<string>("ALL");
  const [addShiftOpen, setAddShiftOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const { data: allDepartments } = useQuery({ queryKey: ["departments", "picker"], queryFn: listDepartments });
  const isSupervisorOnly = canManage && user?.roles.some((r) => r === "SUPERVISOR") && !user?.roles.some((r) => ["HR", "ADMIN"].includes(r));
  const departments = isSupervisorOnly ? (allDepartments ?? []).filter((d) => d.manager?.id === user?.id) : (allDepartments ?? []);
  const managedDeptIds = isSupervisorOnly ? departments.map((d) => d.id) : undefined;

  // Supervisors are scoped to the department(s) they head — no "All Departments"
  // rollup across other teams they don't manage. Default to their own department
  // once it loads instead of the global "ALL" placeholder.
  useEffect(() => {
    if (isSupervisorOnly && departmentId === "ALL" && departments.length > 0) {
      setDepartmentId(departments[0].id);
    }
  }, [isSupervisorOnly, departments, departmentId]);
  const { data: calendar, isLoading } = useQuery({
    queryKey: ["schedules", "calendar", weekStart, departmentId],
    queryFn: () => getCalendar({ weekStart, departmentId: departmentId !== "ALL" ? departmentId : undefined }),
    refetchInterval: 60_000,
  });

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + delta * 7);
    const next = startOfIsoWeek(d);
    setWeekStart(next);
    setSelectedDay(next);
  };

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <PageHeader
        title={canManage ? "Team Schedules" : "My Schedule"}
        subtitle={canManage ? "Plan, publish, and track your team's weekly shifts." : "View your upcoming shifts."}
        action={
          canManage ? (
            <Button onClick={() => setAddShiftOpen(true)} className="flex items-center gap-2 bg-brand text-white hover:bg-[#1467d6]">
              <Plus className="h-4 w-4" /> Add Shift
            </Button>
          ) : undefined
        }
      />

      {canManage ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              aria-label="Previous week"
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-brand-muted hover:bg-[#f6f3f4]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[160px] text-center text-sm font-bold text-brand-ink">
              {calendar ? formatRange(calendar.weekStart, calendar.weekEnd) : "…"}
            </span>
            <button
              type="button"
              onClick={() => shiftWeek(1)}
              aria-label="Next week"
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-brand-muted hover:bg-[#f6f3f4]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center rounded-[10px] border border-[#c3c6d2]/60 p-0.5">
            {(["week", "day"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={
                  view === v
                    ? "rounded-[8px] bg-brand px-3 py-1.5 text-xs font-bold text-white"
                    : "rounded-[8px] px-3 py-1.5 text-xs font-bold text-brand-muted hover:bg-[#f6f3f4]"
                }
              >
                {v === "week" ? "Week" : "Day"}
              </button>
            ))}
          </div>

          {view === "day" ? (
            <input
              type="date"
              value={selectedDay}
              min={weekStart}
              onChange={(e) => setSelectedDay(e.target.value)}
              aria-label="Selected day"
              className="h-9 rounded-[8px] border border-[#c3c6d2]/60 px-3 text-sm text-brand-ink"
            />
          ) : null}

          <div className="ml-auto">
            {isSupervisorOnly ? (
              departments.length > 1 ? (
                <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? departments[0]?.id ?? "ALL")}>
                  <SelectTrigger aria-label="Filter by department" className="h-9 w-48 rounded-[8px] border-[#c3c6d2]/60 bg-white px-3 text-sm">
                    <span className="flex flex-1 text-left truncate">
                      {departments.find((d) => d.id === departmentId)?.name ?? departments[0]?.name}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="flex h-9 w-48 items-center rounded-[8px] border border-[#c3c6d2]/60 bg-[#f6f3f4] px-3 text-sm font-bold text-brand-ink truncate">
                  {departments[0]?.name ?? "No department"}
                </span>
              )
            ) : (
              <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? "ALL")}>
                <SelectTrigger aria-label="Filter by department" className="h-9 w-48 rounded-[8px] border-[#c3c6d2]/60 bg-white px-3 text-sm">
                  <span className="flex flex-1 text-left truncate">
                    {departmentId === "ALL"
                      ? "All Departments"
                      : departments?.find((d) => d.id === departmentId)?.name ?? departmentId}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Departments</SelectItem>
                  {(departments ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      ) : null}

      {canManage ? (
        <>
          <ScheduleSummaryCards summary={calendar?.summary} isLoading={isLoading} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
              <ScheduleGrid
                weekStart={weekStart}
                employees={calendar?.employees ?? []}
                isLoading={isLoading}
                view={view}
                selectedDay={selectedDay}
                onToast={setToast}
                canManage={canManage}
              />
            </div>
            <ScheduleSidebar efficiency={calendar?.efficiency ?? []} canManage={canManage} />
          </div>
        </>
      ) : (
        <EmployeeScheduleCalendar />
      )}

      <AddShiftDrawer open={addShiftOpen} onOpenChange={setAddShiftOpen} onToast={setToast} managedDeptIds={managedDeptIds} />
    </div>
  );
}
