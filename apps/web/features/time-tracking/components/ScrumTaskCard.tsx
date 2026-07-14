"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardList,
  Edit3,
  History,
  Loader2,
  Lock,
  MessageSquareText,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { FieldLabel } from "@/features/auth/components/fields";
import { FieldError, FormBanner } from "@/features/auth/components/FormMessages";
import type { ToastState } from "@/components/shared/Toast";
import {
  completeScrumTask,
  createScrumBlocker,
  createScrumEntry,
  createScrumTask,
  deleteScrumBlocker,
  deleteScrumTask,
  listScrumBlockers,
  listScrumTasks,
  resolveScrumBlocker,
  updateScrumBlocker,
  updateScrumEntry,
  updateScrumTask,
  type ScrumBlocker,
  type ScrumEntry,
  type ScrumTask,
  type ScrumTaskStatus,
} from "@/features/scrum/api/scrum.service";
import { listProjects } from "../api/catalog.service";
import { dailyScrumSchema, type DailyScrumValues } from "../schemas/time-entry.schema";
import { formatClockTime, toIsoDate } from "@/lib/time";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const AUTOSAVE_MS = 30_000;

/** Whole-day status badge (header pill) — mirrors ScrumEntry.status, distinct from per-task status. */
const DAY_STATUS_META: Record<ScrumTaskStatus, { label: string; tone: "neutral" | "info" | "warning" }> = {
  NOT_STARTED: { label: "Not Started", tone: "neutral" },
  IN_PROGRESS: { label: "In Progress", tone: "info" },
  BLOCKED: { label: "Blocked", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "info" },
};

/** Draft persistence for the free-text Yesterday/Notes fields — per calendar day, cleared on save. */
function draftKey(): string {
  return `timeforge.scrum-draft.${toIsoDate(new Date())}`;
}

interface TextDraft {
  yesterday: string;
  notes: string;
}

function readDraft(): TextDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey());
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const d = parsed as Partial<TextDraft>;
    return {
      yesterday: typeof d.yesterday === "string" ? d.yesterday : "",
      notes: typeof d.notes === "string" ? d.notes : "",
    };
  } catch {
    return null;
  }
}

interface ScrumTaskCardProps {
  entry: ScrumEntry | null;
  loading: boolean;
  onToast: (toast: ToastState) => void;
}

export function ScrumTaskCard({ entry, loading, onToast }: ScrumTaskCardProps) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  // Plan New Task Form States
  const [taskDesc, setTaskDesc] = useState("");
  const [taskOutput, setTaskOutput] = useState("");
  const [taskCriteria, setTaskCriteria] = useState("");
  const [taskKpi, setTaskKpi] = useState("");
  const [taskTarget, setTaskTarget] = useState("");
  const [taskProj, setTaskProj] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // New Blocker Form States
  const [blockerDesc, setBlockerDesc] = useState("");
  const [blockerSeverity, setBlockerSeverity] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [editingBlockerId, setEditingBlockerId] = useState<string | null>(null);

  // Refs for smooth scroll
  const taskListRef = useRef<HTMLDivElement>(null);
  const newTaskRef = useRef<HTMLDivElement>(null);

  const { data: projects } = useQuery({ queryKey: ["catalog", "projects"], queryFn: listProjects });

  const { data: tasks = [] } = useQuery({
    queryKey: ["scrum-tasks", entry?.id],
    queryFn: () => listScrumTasks(entry!.id),
    enabled: Boolean(entry),
  });

  const { data: blockers = [] } = useQuery({
    queryKey: ["scrum-blockers", entry?.id],
    queryFn: () => listScrumBlockers(entry!.id),
    enabled: Boolean(entry),
  });

  // Only a fully COMPLETED day is locked (server-computed from task completion).
  const completed = entry?.status === "COMPLETED";
  const locked = entry?.isLocked ?? completed;

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isDirty },
  } = useForm<DailyScrumValues>({
    resolver: zodResolver(dailyScrumSchema),
    defaultValues: {
      yesterday: entry?.yesterday ?? "",
      today: "",
      blockers: "",
      notes: entry?.notes ?? "",
      progress: entry?.progress ?? 0,
      status: entry?.status ?? "NOT_STARTED",
    },
  });

  // Sync the free-text fields when entry or draft loads.
  useEffect(() => {
    if (entry) {
      reset({
        yesterday: entry.yesterday,
        today: "",
        blockers: "",
        notes: entry.notes ?? "",
        progress: entry.progress,
        status: entry.status,
      });
    } else {
      const draft = readDraft();
      if (draft) reset({ yesterday: draft.yesterday, today: "", blockers: "", notes: draft.notes, progress: 0, status: "NOT_STARTED" });
    }
  }, [entry, reset]);

  const hasUnsavedWork = !locked && isDirty;

  // Auto-save a local draft of the free-text fields every 30s while there's unsaved work.
  useEffect(() => {
    if (!hasUnsavedWork) return;
    const id = window.setInterval(() => {
      const values = getValues();
      window.localStorage.setItem(
        draftKey(),
        JSON.stringify({ yesterday: values.yesterday, notes: values.notes }),
      );
      setDraftSavedAt(new Date().toISOString());
    }, AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, [hasUnsavedWork, getValues]);

  // Warn before leaving the page with unsaved scrum work.
  useEffect(() => {
    if (!hasUnsavedWork) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedWork]);

  const invalidateEntry = () => {
    queryClient.invalidateQueries({ queryKey: ["scrum-entries"] });
    queryClient.invalidateQueries({ queryKey: ["scrum-tasks", entry?.id] });
  };

  /** Ensures today's ScrumEntry exists before planning a task/blocker against it. */
  const ensureEntry = useMutation({
    mutationFn: async () => {
      if (entry) return entry;
      const values = getValues();
      const created = await createScrumEntry({
        entryDate: toIsoDate(new Date()),
        yesterday: values.yesterday || "",
        today: "",
      });
      queryClient.invalidateQueries({ queryKey: ["scrum-entries"] });
      return created;
    },
  });

  // Task Handlers
  const createTask = useMutation({
    mutationFn: async () => {
      const activeEntry = await ensureEntry.mutateAsync();
      return createScrumTask(activeEntry.id, {
        title: taskDesc,
        expectedOutput: taskOutput,
        measurement: taskCriteria,
        kpi: taskKpi || undefined,
        plannedTarget: taskTarget || undefined,
        projectId: taskProj || undefined,
      });
    },
    onSuccess: () => {
      invalidateEntry();
      onToast({ message: "Task planned successfully." });
      setTimeout(() => newTaskRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Could not plan task", tone: "error" }),
  });

  const editTask = useMutation({
    mutationFn: (task: ScrumTask) =>
      updateScrumTask(task.id, {
        title: taskDesc,
        expectedOutput: taskOutput,
        measurement: taskCriteria,
        kpi: taskKpi || undefined,
        plannedTarget: taskTarget || undefined,
        projectId: taskProj || undefined,
        version: task.version,
      }),
    onSuccess: () => {
      invalidateEntry();
      onToast({ message: "Task updated." });
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Could not update task", tone: "error" }),
  });

  const completeTask = useMutation({
    mutationFn: (task: ScrumTask) => completeScrumTask(task.id, task.version),
    onSuccess: () => {
      invalidateEntry();
      onToast({ message: "Task marked as completed." });
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Could not complete task", tone: "error" }),
  });

  const removeTask = useMutation({
    mutationFn: (task: ScrumTask) => deleteScrumTask(task.id, task.version),
    onSuccess: () => {
      invalidateEntry();
      onToast({ message: "Task removed." });
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Could not remove task", tone: "error" }),
  });

  const resetTaskForm = () => {
    setTaskDesc("");
    setTaskOutput("");
    setTaskCriteria("");
    setTaskKpi("");
    setTaskTarget("");
    setTaskProj("");
    setEditingTaskId(null);
  };

  const handleAddOrEditTask = () => {
    if (!taskDesc.trim() || !taskOutput.trim() || !taskCriteria.trim()) return;
    if (editingTaskId) {
      const task = tasks.find((t) => t.id === editingTaskId);
      if (task) editTask.mutate(task);
    } else {
      createTask.mutate();
    }
    resetTaskForm();
  };

  const handleEditTaskClick = (item: ScrumTask) => {
    if (locked) return;
    setEditingTaskId(item.id);
    setTaskDesc(item.title);
    setTaskOutput(item.expectedOutput);
    setTaskCriteria(item.measurement);
    setTaskKpi(item.kpi ?? "");
    setTaskTarget(item.plannedTarget ?? "");
    setTaskProj(item.projectId ?? "");
    taskListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDeleteTask = (item: ScrumTask) => {
    if (locked) return;
    removeTask.mutate(item);
  };

  const handleMarkTaskComplete = (item: ScrumTask) => {
    if (locked) return;
    completeTask.mutate(item);
  };

  // Blocker Handlers
  const createBlocker = useMutation({
    mutationFn: async () => {
      const activeEntry = await ensureEntry.mutateAsync();
      return createScrumBlocker(activeEntry.id, { title: blockerDesc, severity: blockerSeverity });
    },
    onSuccess: () => {
      invalidateEntry();
      onToast({ message: "Blocker added." });
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Could not add blocker", tone: "error" }),
  });

  const editBlocker = useMutation({
    mutationFn: (blocker: ScrumBlocker) =>
      updateScrumBlocker(blocker.id, { title: blockerDesc, severity: blockerSeverity, version: blocker.version }),
    onSuccess: () => {
      invalidateEntry();
      onToast({ message: "Blocker updated." });
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Could not update blocker", tone: "error" }),
  });

  const toggleBlocker = useMutation({
    mutationFn: (blocker: ScrumBlocker) =>
      blocker.status === "RESOLVED"
        ? updateScrumBlocker(blocker.id, { status: "OPEN", version: blocker.version })
        : resolveScrumBlocker(blocker.id, blocker.version),
    onSuccess: () => {
      invalidateEntry();
      onToast({ message: "Blocker status updated." });
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Could not update blocker", tone: "error" }),
  });

  const removeBlocker = useMutation({
    mutationFn: (blocker: ScrumBlocker) => deleteScrumBlocker(blocker.id, blocker.version),
    onSuccess: () => {
      invalidateEntry();
      onToast({ message: "Blocker removed." });
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Could not remove blocker", tone: "error" }),
  });

  const handleAddOrEditBlocker = () => {
    if (!blockerDesc.trim()) return;
    if (editingBlockerId) {
      const blocker = blockers.find((b) => b.id === editingBlockerId);
      if (blocker) editBlocker.mutate(blocker);
    } else {
      createBlocker.mutate();
    }
    setBlockerDesc("");
    setBlockerSeverity("MEDIUM");
    setEditingBlockerId(null);
  };

  const handleEditBlockerClick = (item: ScrumBlocker) => {
    if (locked) return;
    setEditingBlockerId(item.id);
    setBlockerDesc(item.title);
    setBlockerSeverity(item.severity === "CRITICAL" ? "HIGH" : item.severity);
  };

  const handleDeleteBlocker = (item: ScrumBlocker) => {
    if (locked) return;
    removeBlocker.mutate(item);
  };

  const handleToggleBlockerStatus = (item: ScrumBlocker) => {
    if (locked) return;
    toggleBlocker.mutate(item);
  };

  // Save Yesterday's Accomplishments / Notes (free text only — tasks/blockers persist immediately).
  const save = useMutation({
    mutationFn: async (values: DailyScrumValues) => {
      const activeEntry = await ensureEntry.mutateAsync();
      return updateScrumEntry(activeEntry.id, {
        yesterday: values.yesterday,
        notes: values.notes || undefined,
        version: activeEntry.version,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrum-entries"] });
      window.localStorage.removeItem(draftKey());
      setDraftSavedAt(null);
      onToast({ message: "Daily Scrum updated." });
    },
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : "Could not save your daily scrum plan");
    },
  });

  const onSubmit = useCallback(
    (values: DailyScrumValues) => {
      setServerError(null);
      save.mutate(values);
    },
    [save],
  );

  // Performance Score — derived from server-fetched tasks for this entry.
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.taskStatus === "COMPLETED").length;
  const completionPercentage = entry?.progress ?? (totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0);
  const willComplete = totalTasks > 0 && completedTasks === totalTasks;

  const hasKpiCount = tasks.filter((t) => t.kpi).length;
  const resolvedBlockersCount = blockers.filter((b) => b.status === "RESOLVED").length;

  const STATUS_META_THEMED = {
    PENDING: { label: "Pending", tone: "neutral" as const },
    IN_PROGRESS: { label: "In Progress", tone: "info" as const },
    COMPLETED: { label: "Completed", tone: "success" as const },
  };

  const isFormValid = taskDesc.trim().length > 0 && taskOutput.trim().length > 0 && taskCriteria.trim().length > 0;

  return (
    <div ref={taskListRef} className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)] space-y-6">
      {/* Title Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#c3c6d2]/40 pb-4">
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-brand-navy">Daily Scrum Dashboard</h3>
          <p className="text-sm text-brand-muted mt-1">Manage today&apos;s tasks, commitments, and blockers.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {entry && completed ? (
            <span className="flex items-center gap-1.5 rounded-full bg-[#f0fdf4] px-2.5 py-0.5 text-xs font-bold text-[#16a34a] ring-1 ring-[#16a34a]/20">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Completed &amp; Locked
            </span>
          ) : entry ? (
            <StatusBadge {...DAY_STATUS_META[entry.status]} />
          ) : (
            <StatusBadge label="Draft" tone="neutral" />
          )}
        </div>
      </div>

      {/* Dynamic Performance Score Card (Section 6) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-[12px] bg-[#f6f3f4]/40 border border-[#c3c6d2]/20">
        <div>
          <span className="block text-[10px] uppercase font-bold text-brand-muted tracking-[0.5px]">Total Tasks</span>
          <span className="text-xl font-mono font-bold text-brand-navy">{totalTasks}</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase font-bold text-brand-muted tracking-[0.5px]">Completed</span>
          <span className="text-xl font-mono font-bold text-green-600">{completedTasks}</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase font-bold text-brand-muted tracking-[0.5px]">Completion</span>
          <span className="text-xl font-mono font-bold text-brand">{completionPercentage}%</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase font-bold text-brand-muted tracking-[0.5px]">KPI Active</span>
          <span className="text-xl font-mono font-bold text-brand-navy">{hasKpiCount}</span>
        </div>
      </div>

      {/* Completion progress bar with quarter markers */}
      <div>
        <ProgressBar percent={completionPercentage} label="Task completion" />
        <div className="mt-1 flex justify-between text-[10px] font-semibold text-brand-muted/70">
          {[0, 25, 50, 75, 100].map((mark) => (
            <span key={mark}>{mark}%</span>
          ))}
        </div>
      </div>

      {serverError ? <FormBanner message={serverError} /> : null}
      {errors.yesterday?.message || errors.notes?.message ? (
        <FormBanner message={(errors.yesterday?.message ?? errors.notes?.message)!} />
      ) : null}

      {/* Today's Commitments Section (Section 2) */}
      <div className="space-y-4">
        <h4 className="flex items-center gap-2 text-sm font-bold text-brand-navy uppercase tracking-[0.5px]">
          <ClipboardList className="h-4 w-4 text-brand" aria-hidden="true" />
          Today&apos;s Commitments
        </h4>
        <div className="space-y-3">
          {tasks.map((item, idx) => (
            <div
              key={item.id}
              ref={idx === tasks.length - 1 ? newTaskRef : null}
              className="p-4 rounded-[12px] border border-[#c3c6d2]/30 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:border-brand/30 transition-all flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-3 border-b border-[#c3c6d2]/20 pb-2">
                <span className="font-bold text-xs text-brand-muted">Task #{idx + 1}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-brand-muted">Planned at {formatClockTime(item.createdAt)}</span>
                  {item.completedAt && (
                    <span className="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                      Done at {formatClockTime(item.completedAt)}
                    </span>
                  )}
                  <StatusBadge {...STATUS_META_THEMED[item.taskStatus]} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-bold text-brand-navy block mb-0.5">Description:</span>
                  <p className="text-brand-ink">{item.title}</p>
                </div>
                <div>
                  <span className="font-bold text-brand-navy block mb-0.5">Expected Output:</span>
                  <p className="text-brand-ink">{item.expectedOutput}</p>
                </div>
                <div>
                  <span className="font-bold text-brand-navy block mb-0.5">Measurement Criteria:</span>
                  <p className="text-brand-ink">{item.measurement}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-bold text-brand-navy block mb-0.5">KPI:</span>
                    <p className="text-brand-ink truncate">{item.kpi || "—"}</p>
                  </div>
                  <div>
                    <span className="font-bold text-brand-navy block mb-0.5">Target:</span>
                    <p className="text-brand-ink truncate">{item.plannedTarget || "—"}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[#c3c6d2]/20 pt-2 text-xs">
                <span className="text-brand-muted">
                  Project: <strong className="text-brand-ink font-semibold">{projects?.find(p => p.id === item.projectId)?.name || "General work"}</strong>
                </span>

                {!locked && (
                  <div className="flex items-center gap-2">
                    {item.taskStatus !== "COMPLETED" && (
                      <button
                        type="button"
                        onClick={() => handleMarkTaskComplete(item)}
                        className="flex h-7 items-center gap-1 rounded-[6px] bg-[#16a34a] px-3 py-1 text-xs font-bold text-white hover:bg-[#15803d] transition-colors"
                      >
                        <Check className="h-3 w-3" />
                        Complete
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleEditTaskClick(item)}
                      className="flex h-7 items-center gap-1 rounded-[6px] border border-[#c3c6d2] px-2.5 py-1 text-xs font-bold text-brand-navy hover:bg-[#f6f3f4]"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(item)}
                      className="flex h-7 items-center gap-1 rounded-[6px] border border-red-200 px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {tasks.length === 0 && (
            <p className="text-xs text-brand-muted italic py-3 text-center border border-dashed border-[#c3c6d2]/50 rounded-[12px]">
              No planned commitments for today yet. Use the planner form below.
            </p>
          )}
        </div>
      </div>

      {/* Plan New Task Form (Section 3) */}
      {!locked && (
        <div className="p-4 rounded-[12px] border border-[#c3c6d2]/40 bg-[#f6f3f4]/10 space-y-4">
          <h4 className="text-sm font-bold text-brand-navy uppercase tracking-[0.5px]">
            {editingTaskId ? "Edit Commitment Task" : "Plan New Task"}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="new-task-desc">Task Description <span className="text-red-500">*</span></FieldLabel>
              <Textarea
                id="new-task-desc"
                rows={2}
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                placeholder="What is the objective or task title?"
              />
            </div>
            <div>
              <FieldLabel htmlFor="new-task-output">Expected Output <span className="text-red-500">*</span></FieldLabel>
              <Textarea
                id="new-task-output"
                rows={2}
                value={taskOutput}
                onChange={(e) => setTaskOutput(e.target.value)}
                placeholder="What is the deliverable or output?"
              />
            </div>
            <div>
              <FieldLabel htmlFor="new-task-criteria">Measurement Criteria <span className="text-red-500">*</span></FieldLabel>
              <Textarea
                id="new-task-criteria"
                rows={2}
                value={taskCriteria}
                onChange={(e) => setTaskCriteria(e.target.value)}
                placeholder="How will this task output be measured?"
              />
            </div>

            {/* Assigned Project sits on its own row above KPI Indicator and
                Planned Target (which share the row below). */}
            <div className="space-y-3">
              <div>
                <FieldLabel htmlFor="new-task-project">Assigned Project</FieldLabel>
                <select
                  id="new-task-project"
                  value={taskProj}
                  onChange={(e) => setTaskProj(e.target.value)}
                  className="h-11 w-full rounded-[10px] border border-[#c3c6d2] bg-white px-3 text-sm focus:outline-none focus:border-brand"
                >
                  <option value="">General Work (No Project)</option>
                  {projects?.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="new-task-kpi">KPI Indicator</FieldLabel>
                  <input
                    id="new-task-kpi"
                    type="text"
                    value={taskKpi}
                    onChange={(e) => setTaskKpi(e.target.value)}
                    placeholder="e.g. Sales, Speed"
                    className="h-11 w-full rounded-[10px] border border-[#c3c6d2] bg-white px-3 text-sm focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="new-task-target">Planned Target</FieldLabel>
                  <input
                    id="new-task-target"
                    type="text"
                    value={taskTarget}
                    onChange={(e) => setTaskTarget(e.target.value)}
                    placeholder="e.g. 5 deals, 10 hours"
                    className="h-11 w-full rounded-[10px] border border-[#c3c6d2] bg-white px-3 text-sm focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-[#c3c6d2]/20 pt-3">
            {editingTaskId && (
              <button
                type="button"
                onClick={resetTaskForm}
                className="h-10 px-4 rounded-[8px] border border-[#c3c6d2] text-xs font-bold text-brand-navy hover:bg-[#f6f3f4]"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={!isFormValid || createTask.isPending || editTask.isPending}
              onClick={handleAddOrEditTask}
              className={cn(
                "h-10 px-5 rounded-[8px] text-xs font-bold text-white transition-all flex items-center gap-1.5",
                isFormValid ? "bg-brand hover:bg-[#1467d6] cursor-pointer" : "bg-brand/40 cursor-not-allowed"
              )}
            >
              {createTask.isPending || editTask.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {editingTaskId ? "Save Task Changes" : "Plan Commitment Task"}
            </button>
          </div>
        </div>
      )}

      {/* Multiple Blockers Section (Section 7) */}
      <div className="space-y-4 border-t border-[#c3c6d2]/30 pt-4">
        <h4 className="flex items-center gap-2 text-sm font-bold text-brand-navy uppercase tracking-[0.5px]">
          <AlertTriangle className="h-4 w-4 text-brand" aria-hidden="true" />
          Active Blockers &amp; Issues
          {blockers.length > 0 ? (
            <span className="rounded-full bg-[#f6f3f4] px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-brand-muted">
              {resolvedBlockersCount}/{blockers.length} resolved
            </span>
          ) : null}
        </h4>
        <div className="space-y-2">
          {blockers.map((b) => (
            <div
              key={b.id}
              className={cn(
                "p-3 rounded-[10px] border flex items-center justify-between gap-3 text-xs",
                b.status === "RESOLVED" ? "bg-green-50/50 border-green-200" : "bg-red-50/30 border-red-200/50"
              )}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertCircle className={cn("h-4 w-4 shrink-0 mt-0.5", b.status === "RESOLVED" ? "text-green-500" : "text-red-500")} />
                <div>
                  <p className={cn("font-medium", b.status === "RESOLVED" ? "line-through text-brand-muted" : "text-brand-ink")}>
                    {b.title}
                  </p>
                  <span className="text-[10px] font-bold text-brand-muted mt-0.5 block">
                    Severity: {b.severity} · Status: {b.status}
                  </span>
                </div>
              </div>

              {!locked && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleToggleBlockerStatus(b)}
                    className={cn(
                      "h-7 px-2.5 rounded-[6px] font-bold text-[10px] border transition-colors",
                      b.status === "RESOLVED"
                        ? "border-[#c3c6d2] text-brand-navy hover:bg-[#f6f3f4]"
                        : "border-green-200 bg-green-600 text-white hover:bg-green-700"
                    )}
                  >
                    {b.status === "RESOLVED" ? "Reopen" : "Resolve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEditBlockerClick(b)}
                    className="h-7 w-7 rounded-[6px] border border-[#c3c6d2] flex items-center justify-center text-brand-navy hover:bg-[#f6f3f4]"
                  >
                    <Edit3 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBlocker(b)}
                    className="h-7 w-7 rounded-[6px] border border-red-200 flex items-center justify-center text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {blockers.length === 0 && (
            <p className="flex items-center justify-center gap-1.5 rounded-[10px] bg-[#f0fdf4] py-2.5 text-xs font-bold text-[#16a34a]">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              No blockers today
            </p>
          )}
        </div>

        {/* Add Blocker Form */}
        {!locked && (
          <div className="flex flex-wrap items-end gap-3 bg-[#f6f3f4]/20 p-3 rounded-[10px] border border-[#c3c6d2]/20">
            <div className="flex-1 min-w-[200px]">
              <FieldLabel htmlFor="blocker-desc">Blocker Description</FieldLabel>
              <input
                id="blocker-desc"
                type="text"
                value={blockerDesc}
                onChange={(e) => setBlockerDesc(e.target.value)}
                placeholder="What is blocking you?"
                className="h-10 w-full rounded-[8px] border border-[#c3c6d2] bg-white px-3 text-xs focus:outline-none focus:border-brand"
              />
            </div>
            <div className="w-[120px]">
              <FieldLabel htmlFor="blocker-severity">Severity</FieldLabel>
              <select
                id="blocker-severity"
                value={blockerSeverity}
                onChange={(e) => setBlockerSeverity(e.target.value as "LOW" | "MEDIUM" | "HIGH")}
                className="h-10 w-full rounded-[8px] border border-[#c3c6d2] bg-white px-2.5 text-xs focus:outline-none focus:border-brand"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <button
              type="button"
              disabled={!blockerDesc.trim() || createBlocker.isPending || editBlocker.isPending}
              onClick={handleAddOrEditBlocker}
              className={cn(
                "h-10 px-4 rounded-[8px] text-xs font-bold text-white transition-all",
                blockerDesc.trim() ? "bg-brand hover:bg-[#1467d6] cursor-pointer" : "bg-brand/40 cursor-not-allowed"
              )}
            >
              {editingBlockerId ? "Save" : "Add Blocker"}
            </button>
          </div>
        )}
      </div>

      {/* Main Lock Form containing text fields & Lock Button (Section 5) */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="border-t border-[#c3c6d2]/30 pt-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Yesterday's Accomplishments — its own card */}
          <div className="rounded-[12px] border border-[#c3c6d2]/30 bg-[#f6f3f4]/20 p-4">
            <FieldLabel htmlFor="yesterday-accomplish">
              <span className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                Yesterday&apos;s Accomplishments
              </span>
            </FieldLabel>
            <Textarea
              id="yesterday-accomplish"
              rows={3}
              disabled={locked}
              placeholder="What did you complete yesterday?"
              invalid={Boolean(errors.yesterday)}
              className="bg-white"
              {...register("yesterday")}
            />
            <FieldError message={errors.yesterday?.message} />
          </div>

          {/* Notes for Supervisor — separate, optional card */}
          <div className="rounded-[12px] border border-[#c3c6d2]/30 bg-[#f6f3f4]/20 p-4">
            <FieldLabel htmlFor="scrum-notes">
              <span className="flex items-center gap-1.5">
                <MessageSquareText className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                Notes for Supervisor{" "}
                <span className="font-normal normal-case text-brand-muted">(optional)</span>
              </span>
            </FieldLabel>
            <Textarea
              id="scrum-notes"
              rows={3}
              disabled={locked}
              placeholder="Any private notes or context for your manager?"
              invalid={Boolean(errors.notes)}
              className="bg-white"
              {...register("notes")}
            />
            <FieldError message={errors.notes?.message} />
          </div>
        </div>

        {locked ? (
          <div className="flex items-center gap-3 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Lock className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-amber-800">Today&apos;s Scrum Locked</p>
              <p className="text-xs text-amber-700">
                Submitted at {entry?.submittedAt ? formatClockTime(entry.submittedAt) : entry ? formatClockTime(entry.updatedAt) : "—"} · Editing Disabled
              </p>
            </div>
          </div>
        ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#c3c6d2]/40 pt-4">
          <div className="text-xs text-brand-muted">
            <p>
              {draftSavedAt ? `Draft auto-saved at ${formatClockTime(draftSavedAt)} · ` : ""}
              Auto-saves every 30s · Ctrl+Enter to submit
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!locked && entry && (
              <button
                type="button"
                onClick={() => {
                  reset({
                    yesterday: entry.yesterday,
                    today: "",
                    blockers: "",
                    notes: entry.notes ?? "",
                    progress: entry.progress,
                    status: entry.status,
                  });
                }}
                className="text-sm font-bold text-brand-muted hover:text-brand-navy"
              >
                Cancel
              </button>
            )}

            {!locked && (
              <button
                type="submit"
                disabled={save.isPending || loading}
                className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-[#1467d6] disabled:opacity-60"
              >
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : willComplete ? (
                  <Lock className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                {willComplete ? "Lock Daily Plan" : "Save Daily Plan"}
              </button>
            )}
          </div>
        </div>
        )}
      </form>
    </div>
  );
}
