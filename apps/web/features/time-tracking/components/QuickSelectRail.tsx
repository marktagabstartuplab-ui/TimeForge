"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Pin, Sparkles, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ToastState } from "@/components/shared/Toast";
import { listProjects } from "../api/catalog.service";
import { readPinnedKeys, togglePinnedKey, type WorkTask } from "../lib/task-select";
import { formatMinutes } from "@/lib/time";
import { cn } from "@/lib/utils";

interface QuickSelectRailProps {
  /** Distinct tasks derived from recent time entries, newest first. */
  tasks: WorkTask[];
  loading: boolean;
  /** One click populates Work Details (and seeds the next Clock In). */
  onSelect: (task: WorkTask) => void;
  onToast: (toast: ToastState) => void;
}

interface TaskCardProps {
  task: WorkTask;
  highlight?: boolean;
  pinned: boolean;
  projectLabel: string;
  onPick: (task: WorkTask) => void;
  onTogglePin: (key: string) => void;
}

/** Small colored icon badge + uppercase label, used to head each rail section. */
function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[1px] text-brand-muted">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-cyan/15 text-brand">
        {icon}
      </span>
      {children}
    </p>
  );
}

function TaskCard({ task, highlight, pinned, projectLabel, onPick, onTogglePin }: TaskCardProps) {
  return (
    <div
      className={cn(
        "group relative rounded-[12px] border bg-white p-3.5 transition-colors",
        highlight ? "border-brand/50 bg-brand-cyan/5" : "border-[#c3c6d2]/50 hover:border-brand/40",
      )}
    >
      <button
        type="button"
        onClick={() => onPick(task)}
        className="block w-full text-left"
        aria-label={`Use task ${task.title}`}
      >
        <p className="pr-7 text-sm font-bold text-brand-ink">{task.title}</p>
        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-brand-muted">
          Project: {projectLabel}
        </p>
        <span className="mt-2 inline-block rounded-full bg-[#f6f3f4] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px] text-brand-muted">
          {formatMinutes(task.minutes)} this week
        </span>
      </button>
      <button
        type="button"
        aria-label={pinned ? `Unpin ${task.title}` : `Pin ${task.title}`}
        aria-pressed={pinned}
        onClick={() => onTogglePin(task.key)}
        className={cn(
          "absolute right-2.5 top-2.5 rounded-full p-1 transition-colors",
          pinned ? "text-brand" : "text-brand-muted/40 hover:text-brand-muted",
        )}
      >
        <Pin className="h-3.5 w-3.5" aria-hidden="true" fill={pinned ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

/**
 * Right rail — Quick Select. "Tasks" are derived from recent time entries
 * (there is no Task entity server-side); pins are a client-side convenience
 * stored in localStorage. Favorite Projects = most-tracked projects in the
 * queried range (real data, read-only).
 */
export function QuickSelectRail({ tasks, loading, onSelect, onToast }: QuickSelectRailProps) {
  // AppShell renders client-side only (session-gated), so reading
  // localStorage in the initializer is hydration-safe.
  const [pinnedKeys, setPinnedKeys] = useState<string[]>(() => readPinnedKeys());
  const { data: projects } = useQuery({ queryKey: ["catalog", "projects"], queryFn: listProjects });

  const projectName = (id: string | null) =>
    (id && projects?.find((p) => p.id === id)?.name) || "No project";

  const suggested = tasks.length ? [...tasks].sort((a, b) => b.minutes - a.minutes)[0] : null;
  const pinned = tasks.filter((t) => pinnedKeys.includes(t.key));
  const recent = tasks.filter((t) => !pinnedKeys.includes(t.key)).slice(0, 5);

  const favoriteProjects = (() => {
    const byProject = new Map<string, number>();
    for (const t of tasks) {
      if (!t.projectId) continue;
      byProject.set(t.projectId, (byProject.get(t.projectId) ?? 0) + t.minutes);
    }
    return [...byProject.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([id, minutes]) => ({ id, minutes }));
  })();

  const pick = (task: WorkTask) => {
    onSelect(task);
    onToast({ message: `"${task.title}" loaded into Work Details.` });
  };

  const togglePin = (key: string) => setPinnedKeys(togglePinnedKey(key));

  const cardProps = (task: WorkTask) => ({
    task,
    pinned: pinnedKeys.includes(task.key),
    projectLabel: projectName(task.projectId),
    onPick: pick,
    onTogglePin: togglePin,
  });

  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2.5 border-b border-[#c3c6d2]/40 pb-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-brand-cyan/20 text-brand">
          <History className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-xl text-brand-navy">Quick Select</h3>
          <p className="text-xs text-brand-muted">Resume recently used tasks</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <p className="mt-4 rounded-[10px] bg-[#f6f3f4] px-4 py-3 text-xs text-brand-muted">
          No recent tasks yet — your tracked sessions will appear here for one-click reuse.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {suggested ? (
            <div>
              <SectionLabel icon={<Sparkles className="h-3 w-3" aria-hidden="true" />}>
                Suggested Task
              </SectionLabel>
              <TaskCard {...cardProps(suggested)} highlight />
            </div>
          ) : null}

          {pinned.length > 0 ? (
            <div className="border-t border-[#c3c6d2]/40 pt-3">
              <SectionLabel icon={<Pin className="h-3 w-3" aria-hidden="true" />}>Pinned Tasks</SectionLabel>
              <div className="flex flex-col gap-2">
                {pinned.map((t) => (
                  <TaskCard key={t.key} {...cardProps(t)} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="border-t border-[#c3c6d2]/40 pt-3">
            <SectionLabel icon={<History className="h-3 w-3" aria-hidden="true" />}>Recent Tasks</SectionLabel>
            <div className="flex flex-col gap-2">
              {recent.map((t) => (
                <TaskCard key={t.key} {...cardProps(t)} />
              ))}
            </div>
          </div>

          {favoriteProjects.length > 0 ? (
            <div className="border-t border-[#c3c6d2]/40 pt-3">
              <SectionLabel icon={<Star className="h-3 w-3" aria-hidden="true" />}>
                Favorite Projects
              </SectionLabel>
              <ul className="flex flex-col gap-1.5">
                {favoriteProjects.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span className="truncate font-semibold text-brand-ink">{projectName(p.id)}</span>
                    <span className="shrink-0 text-xs text-brand-muted">{formatMinutes(p.minutes)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
