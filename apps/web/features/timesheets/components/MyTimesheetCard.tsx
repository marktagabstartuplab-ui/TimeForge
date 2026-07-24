"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, Coffee, Download, Search } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { listAllTimeEntries, type TimeEntry } from "@/features/time-tracking/api/time-entries.service";
import { summarizeDay } from "@/features/time-tracking/lib/day-summary";
import {
  endOfDay,
  formatClockTime,
  formatMinutes,
  formatMinutesClock,
  startOfDay,
  toIsoDate,
} from "@/lib/time";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 7;

type RangePreset = "7d" | "30d" | "custom";

/** One aggregated timesheet day — everything derived from timer sessions. */
interface DayRow {
  dateKey: string;
  dateLabel: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  workMinutes: number;
  breakMinutes: number;
  totalMinutes: number;
  status: { label: string; tone: BadgeTone };
}

/** Parses YYYY-MM-DD as a *local* date (new Date(iso) would parse as UTC). */
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysAgo(n: number): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate() - n);
}

/** Groups a range's entries into per-day timesheet rows, newest first. */
function buildDayRows(entries: TimeEntry[]): DayRow[] {
  const byDay = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const key = toIsoDate(new Date(entry.startTime));
    const bucket = byDay.get(key);
    if (bucket) bucket.push(entry);
    else byDay.set(key, [entry]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([dateKey, dayEntries]) => {
      const day = summarizeDay(dayEntries);
      const allVerified = dayEntries.every((e) => e.timesheetId);
      return {
        dateKey,
        dateLabel: parseIsoDate(dateKey).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        clockInAt: day.clockInAt,
        clockOutAt: day.clockOutAt,
        workMinutes: day.trackedMinutes,
        breakMinutes: day.breakMinutes,
        totalMinutes: day.trackedMinutes + day.breakMinutes,
        status: day.running
          ? { label: "In Progress", tone: "success" as const }
          : allVerified
            ? { label: "Verified", tone: "info" as const }
            : { label: "Complete", tone: "neutral" as const },
      };
    });
}

/** Builds and downloads the CSV for the currently filtered rows. */
function exportCsv(rows: DayRow[], fromIso: string, toIso: string) {
  const header = ["Date", "Time In", "Time Out", "Work Hours", "Break Time", "Total", "Status"];
  const lines = rows.map((r) =>
    [
      r.dateKey,
      r.clockInAt ? formatClockTime(r.clockInAt) : "",
      r.clockOutAt ? formatClockTime(r.clockOutAt) : "In progress",
      formatMinutesClock(r.workMinutes),
      formatMinutesClock(r.breakMinutes),
      formatMinutesClock(r.totalMinutes),
      r.status.label,
    ]
      .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
      .join(","),
  );
  const csv = [header.join(","), ...lines].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `my-timesheet-${fromIso}-to-${toIso}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "30 Days" },
  { id: "custom", label: "Custom Range" },
];

/**
 * "My Timesheet" — the smart, read-only timesheet. Every figure is derived
 * from timer sessions (GET /time-entries); nothing here is manually entered.
 * Range presets, search, pagination and CSV export are all client-side.
 */
export function MyTimesheetCard({ onDaySelect }: { onDaySelect?: (dateKey: string) => void }) {
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [customFrom, setCustomFrom] = useState(() => toIsoDate(daysAgo(6)));
  const [customTo, setCustomTo] = useState(() => toIsoDate(new Date()));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const range = useMemo(() => {
    if (preset === "7d") return { from: daysAgo(6), to: new Date() };
    if (preset === "30d") return { from: daysAgo(29), to: new Date() };
    const from = parseIsoDate(customFrom);
    const to = parseIsoDate(customTo);
    return from <= to ? { from, to } : { from: to, to: from };
  }, [preset, customFrom, customTo]);

  const fromIso = toIsoDate(range.from);
  const toIso = toIsoDate(range.to);

  const entriesQuery = useQuery({
    queryKey: ["time-entries", "my-timesheet", fromIso, toIso],
    queryFn: () =>
      listAllTimeEntries({
        from: startOfDay(range.from).toISOString(),
        to: endOfDay(range.to).toISOString(),
      }),
  });

  const allRows = useMemo(
    () => buildDayRows(entriesQuery.data ?? []),
    [entriesQuery.data],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((r) =>
      `${r.dateLabel} ${r.dateKey} ${r.status.label}`.toLowerCase().includes(q),
    );
  }, [allRows, search]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filteredRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const stats = useMemo(
    () =>
      filteredRows.reduce(
        (acc, r) => ({
          workMinutes: acc.workMinutes + r.workMinutes,
          breakMinutes: acc.breakMinutes + r.breakMinutes,
        }),
        { workMinutes: 0, breakMinutes: 0 },
      ),
    [filteredRows],
  );

  const columns: DataTableColumn<DayRow>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => <span className="whitespace-nowrap font-semibold text-brand-ink">{r.dateLabel}</span>,
    },
    {
      key: "timeIn",
      header: "Time In",
      render: (r) => (
        <span className="whitespace-nowrap text-brand-muted">
          {r.clockInAt ? formatClockTime(r.clockInAt) : "—"}
        </span>
      ),
    },
    {
      key: "timeOut",
      header: "Time Out",
      render: (r) => (
        <span className="whitespace-nowrap text-brand-muted">
          {r.clockOutAt ? formatClockTime(r.clockOutAt) : "In progress"}
        </span>
      ),
    },
    {
      key: "work",
      header: "Work Hours",
      render: (r) => <span className="font-semibold text-brand-ink">{formatMinutes(r.workMinutes)}</span>,
    },
    {
      key: "break",
      header: "Break Time",
      render: (r) => <span className="text-brand-muted">{formatMinutes(r.breakMinutes)}</span>,
    },
    {
      key: "total",
      header: "Total",
      render: (r) => <StatusBadge label={formatMinutesClock(r.totalMinutes)} tone="info" />,
    },
    {
      key: "status",
      header: "Status",
      className: "text-right",
      render: (r) => <StatusBadge label={r.status.label} tone={r.status.tone} />,
    },
  ];

  const statTiles = [
    {
      label: "Total Work Hours",
      value: formatMinutes(stats.workMinutes),
      icon: <Clock3 className="h-5 w-5" aria-hidden="true" />,
    },
    {
      label: "Break Hours",
      value: formatMinutes(stats.breakMinutes),
      icon: <Coffee className="h-5 w-5" aria-hidden="true" />,
    },
    {
      label: "Days Logged",
      value: String(filteredRows.length),
      icon: <CalendarDays className="h-5 w-5" aria-hidden="true" />,
    },
  ];

  const inputClass =
    "h-9 rounded-[8px] border border-[#c3c6d2] bg-white px-3 text-sm text-brand-ink outline-none focus:border-brand";

  return (
    <div className="flex flex-col rounded-[16px] border border-[#c3c6d2]/50 bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-[25px] pt-[25px] pb-4">
        <h3 className="text-xl text-brand-navy">My Timesheet</h3>
        <button
          type="button"
          onClick={() => exportCsv(filteredRows, fromIso, toIso)}
          disabled={filteredRows.length === 0}
          className="flex h-9 items-center gap-2 rounded-[8px] border border-[#c3c6d2]/60 bg-white px-3.5 text-sm font-bold text-brand-navy transition-colors hover:bg-[#f6f3f4] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4 text-brand" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {/* Controls: range presets, custom range, search */}
      <div className="flex flex-wrap items-center gap-3 px-[25px] pb-4">
        <div className="flex items-center gap-1 rounded-[10px] bg-[#f6f3f4] p-1" role="group" aria-label="Date range">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={preset === p.id}
              onClick={() => {
                setPreset(p.id);
                setPage(0);
              }}
              className={cn(
                "h-8 rounded-[8px] px-3 text-sm font-bold transition-colors",
                preset === p.id ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === "custom" ? (
          <div className="flex items-center gap-2">
            <label htmlFor="ts-range-from" className="sr-only">
              From date
            </label>
            <input
              id="ts-range-from"
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                setPage(0);
              }}
              className={inputClass}
            />
            <span className="text-sm text-brand-muted">to</span>
            <label htmlFor="ts-range-to" className="sr-only">
              To date
            </label>
            <input
              id="ts-range-to"
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(e) => {
                setCustomTo(e.target.value);
                setPage(0);
              }}
              className={inputClass}
            />
          </div>
        ) : null}

        <div className="relative ml-auto">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted/70"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search days..."
            aria-label="Search timesheet days"
            className={cn(inputClass, "w-[200px] pl-9")}
          />
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 gap-3 px-[25px] pb-5 sm:grid-cols-3">
        {statTiles.map((tile) => (
          <div
            key={tile.label}
            className="flex items-center gap-3 rounded-[12px] border border-[#c3c6d2]/50 bg-[#f6f3f4] px-4 py-4"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-cyan/20 text-brand">
              {tile.icon}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">{tile.label}</p>
              <p className="truncate text-xl font-bold text-brand-ink">
                {entriesQuery.isLoading ? "—" : tile.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="px-[25px] pb-2">
        {entriesQuery.isError ? (
          <ErrorState
            message="Could not load your timesheet entries."
            onRetry={() => entriesQuery.refetch()}
          />
        ) : entriesQuery.isLoading ? (
          <div className="flex flex-col gap-2 pb-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <DataTable
            aria-label="My timesheet days"
            columns={columns}
            rows={pageRows}
            rowKey={(r) => r.dateKey}
            onRowClick={onDaySelect ? (r) => onDaySelect(r.dateKey) : undefined}
            emptyState={
              <EmptyState
                message={
                  search
                    ? "No days match your search."
                    : "No sessions recorded in this range — clock in from the Daily Scrum page."
                }
              />
            }
          />
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3 border-t border-[#c3c6d2]/40 px-[25px] py-3">
        <p className="text-sm text-brand-muted">
          {filteredRows.length === 0
            ? "0 days"
            : `Showing ${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, filteredRows.length)} of ${filteredRows.length} days`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="h-8 rounded-[8px] border border-[#c3c6d2]/60 bg-white px-3 text-sm font-bold text-brand-navy transition-colors hover:bg-[#f6f3f4] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm tabular-nums text-brand-muted">
            {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            className="h-8 rounded-[8px] border border-[#c3c6d2]/60 bg-white px-3 text-sm font-bold text-brand-navy transition-colors hover:bg-[#f6f3f4] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
