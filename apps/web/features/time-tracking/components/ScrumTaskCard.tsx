"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Loader2, Lock, PencilLine, Plus, Trash2, Edit3, X, AlertCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { FieldLabel } from "@/features/auth/components/fields";
import { FieldError, FormBanner } from "@/features/auth/components/FormMessages";
import type { ToastState } from "@/components/shared/Toast";
import {
  createScrumEntry,
  updateScrumEntry,
  type ScrumEntry,
  type ScrumTaskStatus,
} from "@/features/scrum/api/scrum.service";
import { listProjects } from "../api/catalog.service";
import { dailyScrumSchema, type DailyScrumValues } from "../schemas/time-entry.schema";
import type { WorkTask } from "../lib/task-select";
import { formatClockTime, formatMinutes, toIsoDate } from "@/lib/time";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface ScrumTaskItem {
  id: string;
  description: string;
  expectedOutput: string;
  measurementCriteria: string;
  kpi: string;
  plannedTarget: string;
  projectId: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  createdAt: string;
  completedAt?: string | null;
}

export interface BlockerItem {
  id: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  status: "OPEN" | "RESOLVED";
}

export function parseTasks(todayStr: string | null | undefined): ScrumTaskItem[] {
  if (!todayStr) return [];
  try {
    const parsed = JSON.parse(todayStr);
    if (Array.isArray(parsed)) {
      return parsed.map((t: any) => ({
        id: t.id || Math.random().toString(36).substring(7),
        description: t.description || t.title || "",
        expectedOutput: t.expectedOutput || "",
        measurementCriteria: t.measurementCriteria || "",
        kpi: t.kpi || "",
        plannedTarget: t.plannedTarget || "",
        projectId: t.projectId || "",
        status: t.status === "COMPLETED" ? "COMPLETED" : t.status === "IN_PROGRESS" ? "IN_PROGRESS" : "PENDING",
        createdAt: t.createdAt || new Date().toISOString(),
        completedAt: t.completedAt || null,
      }));
    }
  } catch {
    if (todayStr.trim()) {
      return [
        {
          id: "legacy",
          description: todayStr,
          expectedOutput: "Legacy Import",
          measurementCriteria: "Legacy Import",
          kpi: "",
          plannedTarget: "",
          projectId: "",
          status: "PENDING",
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
      ];
    }
  }
  return [];
}

export function parseBlockers(blockersStr: string | null | undefined): BlockerItem[] {
  if (!blockersStr) return [];
  try {
    const parsed = JSON.parse(blockersStr);
    if (Array.isArray(parsed)) {
      return parsed.map((b: any) => ({
        id: b.id || Math.random().toString(36).substring(7),
        description: b.description || "",
        severity: b.severity || "MEDIUM",
        status: b.status || "OPEN",
      }));
    }
  } catch {
    if (blockersStr.trim()) {
      return [
        {
          id: "legacy-blocker",
          description: blockersStr,
          severity: "MEDIUM",
          status: "OPEN",
        },
      ];
    }
  }
  return [];
}

const AUTOSAVE_MS = 30_000;

/** Draft persistence — per calendar day, cleared on successful submission. */
function draftKey(): string {
  return `timeforge.scrum-draft.${toIsoDate(new Date())}`;
}

function readDraft(): DailyScrumValues | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey());
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const d = parsed as Partial<DailyScrumValues>;
    return {
      yesterday: typeof d.yesterday === "string" ? d.yesterday : "",
      today: typeof d.today === "string" ? d.today : "",
      blockers: typeof d.blockers === "string" ? d.blockers : "",
      notes: typeof d.notes === "string" ? d.notes : "",
      progress: typeof d.progress === "number" ? Math.min(100, Math.max(0, d.progress)) : 0,
      status: ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED"].includes(d.status as string)
        ? (d.status as ScrumTaskStatus)
        : "NOT_STARTED",
    };
  } catch {
    return null;
  }
}

interface ScrumTaskCardProps {
  entry: ScrumEntry | null;
  task: WorkTask | null;
  trackedMinutes: number;
  loading: boolean;
  onToast: (toast: ToastState) => void;
}

export function ScrumTaskCard({ entry, task, trackedMinutes, loading, onToast }: ScrumTaskCardProps) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  
  // Custom interactive states for Tasks & Blockers
  const [tasks, setTasks] = useState<ScrumTaskItem[]>([]);
  const [blockers, setBlockers] = useState<BlockerItem[]>([]);
  
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
  const projectName = (task?.projectId && projects?.find((p) => p.id === task.projectId)?.name) || "No project";

  const completed = entry?.status === "COMPLETED";
  const locked = Boolean(entry) && (!editing || completed);

  const {
    register,
    handleSubmit,
    control,
    reset,
    getValues,
    setValue,
    formState: { errors, isDirty },
  } = useForm<DailyScrumValues>({
    resolver: zodResolver(dailyScrumSchema),
    defaultValues: {
      yesterday: entry?.yesterday ?? "",
      today: entry?.today ?? "",
      blockers: entry?.blockers ?? "",
      notes: entry?.notes ?? "",
      progress: entry?.progress ?? 0,
      status: entry?.status ?? "NOT_STARTED",
    },
  });

  const liveProgress = useWatch({ control, name: "progress" });

  // Sync state when entry or draft loads
  useEffect(() => {
    if (entry) {
      setTasks(parseTasks(entry.today));
      setBlockers(parseBlockers(entry.blockers));
    } else {
      const draft = readDraft();
      if (draft) {
        setTasks(parseTasks(draft.today));
        setBlockers(parseBlockers(draft.blockers));
      } else {
        setTasks([]);
        setBlockers([]);
      }
    }
  }, [entry]);

  // Keep Zod form fields in sync with the JSON arrays
  useEffect(() => {
    setValue("today", tasks.length > 0 ? JSON.stringify(tasks) : "");
    setValue("blockers", blockers.length > 0 ? JSON.stringify(blockers) : "");
  }, [tasks, blockers, setValue]);

  // Calculate dynamic overall progress from tasks
  const updateScrumProgressAndStatus = (currentTasks: ScrumTaskItem[]) => {
    const completedCount = currentTasks.filter(t => t.status === "COMPLETED").length;
    const progressVal = currentTasks.length > 0 ? Math.round((completedCount / currentTasks.length) * 100) : 0;
    setValue("progress", progressVal);
    
    if (progressVal === 100) {
      setValue("status", "COMPLETED");
    } else if (progressVal > 0) {
      setValue("status", "IN_PROGRESS");
    } else {
      setValue("status", "NOT_STARTED");
    }
  };

  // Task Handlers
  const handleAddOrEditTask = () => {
    if (!taskDesc.trim() || !taskOutput.trim() || !taskCriteria.trim()) return;

    if (editingTaskId) {
      // Modify existing task
      setTasks(prev => {
        const updated = prev.map(t => {
          if (t.id === editingTaskId) {
            return {
              ...t,
              description: taskDesc,
              expectedOutput: taskOutput,
              measurementCriteria: taskCriteria,
              kpi: taskKpi,
              plannedTarget: taskTarget,
              projectId: taskProj,
            };
          }
          return t;
        });
        updateScrumProgressAndStatus(updated);
        return updated;
      });
      setEditingTaskId(null);
      onToast({ message: "Task updated." });
    } else {
      // Create new task
      const newTask: ScrumTaskItem = {
        id: Math.random().toString(36).substring(7),
        description: taskDesc,
        expectedOutput: taskOutput,
        measurementCriteria: taskCriteria,
        kpi: taskKpi,
        plannedTarget: taskTarget,
        projectId: taskProj,
        status: "PENDING",
        createdAt: new Date().toISOString(),
        completedAt: null
      };
      setTasks(prev => {
        const updated = [...prev, newTask];
        updateScrumProgressAndStatus(updated);
        return updated;
      });
      onToast({ message: "Task planned successfully." });

      // Smooth scroll to the new task
      setTimeout(() => {
        newTaskRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }

    // Reset Form
    setTaskDesc("");
    setTaskOutput("");
    setTaskCriteria("");
    setTaskKpi("");
    setTaskTarget("");
    setTaskProj("");
  };

  const handleEditTaskClick = (item: ScrumTaskItem) => {
    if (locked) return;
    setEditingTaskId(item.id);
    setTaskDesc(item.description);
    setTaskOutput(item.expectedOutput);
    setTaskCriteria(item.measurementCriteria);
    setTaskKpi(item.kpi);
    setTaskTarget(item.plannedTarget);
    setTaskProj(item.projectId);
    
    // Scroll to form
    taskListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDeleteTask = (id: string) => {
    if (locked) return;
    setTasks(prev => {
      const updated = prev.filter(t => t.id !== id);
      updateScrumProgressAndStatus(updated);
      return updated;
    });
    onToast({ message: "Task removed." });
  };

  const handleMarkTaskComplete = (id: string) => {
    if (locked) return;
    const updated = tasks.map(t => {
      if (t.id === id) {
        return {
          ...t,
          status: "COMPLETED" as const,
          completedAt: new Date().toISOString()
        };
      }
      return t;
    });
    setTasks(updated);
    updateScrumProgressAndStatus(updated);
    onToast({ message: "Task marked as completed." });
  };

  // Blocker Handlers
  const handleAddOrEditBlocker = () => {
    if (!blockerDesc.trim()) return;

    if (editingBlockerId) {
      setBlockers(prev => prev.map(b => b.id === editingBlockerId ? { ...b, description: blockerDesc, severity: blockerSeverity } : b));
      setEditingBlockerId(null);
      onToast({ message: "Blocker updated." });
    } else {
      const newBlocker: BlockerItem = {
        id: Math.random().toString(36).substring(7),
        description: blockerDesc,
        severity: blockerSeverity,
        status: "OPEN"
      };
      setBlockers(prev => [...prev, newBlocker]);
      onToast({ message: "Blocker added." });
    }
    setBlockerDesc("");
    setBlockerSeverity("MEDIUM");
  };

  const handleEditBlockerClick = (item: BlockerItem) => {
    if (locked) return;
    setEditingBlockerId(item.id);
    setBlockerDesc(item.description);
    setBlockerSeverity(item.severity);
  };

  const handleDeleteBlocker = (id: string) => {
    if (locked) return;
    setBlockers(prev => prev.filter(b => b.id !== id));
    onToast({ message: "Blocker removed." });
  };

  const handleToggleBlockerStatus = (id: string) => {
    if (locked) return;
    setBlockers(prev => prev.map(b => b.id === id ? { ...b, status: b.status === "OPEN" ? "RESOLVED" : "OPEN" } : b));
    onToast({ message: "Blocker status updated." });
  };

  // Lock Daily Plan Mutation
  const save = useMutation({
    mutationFn: (values: DailyScrumValues) =>
      entry
        ? updateScrumEntry(entry.id, {
            yesterday: values.yesterday,
            today: JSON.stringify(tasks),
            blockers: JSON.stringify(blockers),
            notes: values.notes || undefined,
            progress: values.progress,
            status: values.status,
            version: entry.version,
          })
        : createScrumEntry({
            entryDate: toIsoDate(new Date()),
            yesterday: values.yesterday,
            today: JSON.stringify(tasks),
            blockers: JSON.stringify(blockers),
            notes: values.notes || undefined,
            progress: values.progress,
            status: values.status,
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrum-entries"] });
      window.localStorage.removeItem(draftKey());
      setDraftSavedAt(null);
      setEditing(false);
      onToast({ message: entry ? "Daily Scrum updated." : "Daily Scrum Locked & Submitted." });
    },
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : "Could not lock your daily scrum plan");
    },
  });

  const onSubmit = useCallback(
    (values: DailyScrumValues) => {
      setServerError(null);
      save.mutate(values);
    },
    [save],
  );

  // Performance Score calculations
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === "COMPLETED").length;
  const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  // KPI / Target meta maps
  const hasKpiCount = tasks.filter(t => t.kpi).length;
  const resolvedBlockersCount = blockers.filter(b => b.status === "RESOLVED").length;

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
            <StatusBadge label="Completed" tone="success" />
          ) : entry ? (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Locked
            </span>
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

      {serverError ? <FormBanner message={serverError} /> : null}

      {/* Today's Commitments Section (Section 2) */}
      <div className="space-y-4">
        <h4 className="text-sm font-bold text-brand-navy uppercase tracking-[0.5px]">Today&apos;s Commitments</h4>
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
                  <StatusBadge {...STATUS_META_THEMED[item.status]} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-bold text-brand-navy block mb-0.5">Description:</span>
                  <p className="text-brand-ink">{item.description}</p>
                </div>
                <div>
                  <span className="font-bold text-brand-navy block mb-0.5">Expected Output:</span>
                  <p className="text-brand-ink">{item.expectedOutput}</p>
                </div>
                <div>
                  <span className="font-bold text-brand-navy block mb-0.5">Measurement Criteria:</span>
                  <p className="text-brand-ink">{item.measurementCriteria}</p>
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
                    {item.status !== "COMPLETED" && (
                      <button
                        type="button"
                        onClick={() => handleMarkTaskComplete(item.id)}
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
                      onClick={() => handleDeleteTask(item.id)}
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

          <div className="flex justify-end gap-2 border-t border-[#c3c6d2]/20 pt-3">
            {editingTaskId && (
              <button
                type="button"
                onClick={() => {
                  setEditingTaskId(null);
                  setTaskDesc("");
                  setTaskOutput("");
                  setTaskCriteria("");
                  setTaskKpi("");
                  setTaskTarget("");
                  setTaskProj("");
                }}
                className="h-10 px-4 rounded-[8px] border border-[#c3c6d2] text-xs font-bold text-brand-navy hover:bg-[#f6f3f4]"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={!isFormValid}
              onClick={handleAddOrEditTask}
              className={cn(
                "h-10 px-5 rounded-[8px] text-xs font-bold text-white transition-all flex items-center gap-1.5",
                isFormValid ? "bg-brand hover:bg-[#1467d6] cursor-pointer" : "bg-brand/40 cursor-not-allowed"
              )}
            >
              <Plus className="h-4 w-4" />
              {editingTaskId ? "Save Task Changes" : "Plan Commitment Task"}
            </button>
          </div>
        </div>
      )}

      {/* Multiple Blockers Section (Section 7) */}
      <div className="space-y-4 border-t border-[#c3c6d2]/30 pt-4">
        <h4 className="text-sm font-bold text-brand-navy uppercase tracking-[0.5px]">Active Blockers & Issues</h4>
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
                    {b.description}
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
                    onClick={() => handleToggleBlockerStatus(b.id)}
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
                    onClick={() => handleDeleteBlocker(b.id)}
                    className="h-7 w-7 rounded-[6px] border border-red-200 flex items-center justify-center text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {blockers.length === 0 && (
            <p className="text-xs text-brand-muted italic py-2 text-center">No active blockers reported.</p>
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
                onChange={(e) => setBlockerSeverity(e.target.value as any)}
                className="h-10 w-full rounded-[8px] border border-[#c3c6d2] bg-white px-2.5 text-xs focus:outline-none focus:border-brand"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <button
              type="button"
              disabled={!blockerDesc.trim()}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FieldLabel htmlFor="yesterday-accomplish">Yesterday&apos;s Accomplishments</FieldLabel>
            <Textarea
              id="yesterday-accomplish"
              rows={3}
              disabled={locked}
              placeholder="What did you complete yesterday?"
              invalid={Boolean(errors.yesterday)}
              {...register("yesterday")}
            />
            <FieldError message={errors.yesterday?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="scrum-notes">Notes for Supervisor (optional)</FieldLabel>
            <Textarea
              id="scrum-notes"
              rows={3}
              disabled={locked}
              placeholder="Any private notes or context for your manager?"
              invalid={Boolean(errors.notes)}
              {...register("notes")}
            />
            <FieldError message={errors.notes?.message} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#c3c6d2]/40 pt-4">
          <div className="text-xs text-brand-muted">
            {locked ? (
              <p className="font-bold text-amber-700 flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" />
                Today&apos;s Scrum Locked · Submitted at {entry ? formatClockTime(entry.updatedAt) : "—"}
              </p>
            ) : (
              <p>
                {draftSavedAt ? `Draft auto-saved at ${formatClockTime(draftSavedAt)} · ` : ""}
                Auto-saves every 30s · Ctrl+Enter to submit
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {!locked && entry && (
              <button
                type="button"
                onClick={() => {
                  reset({
                    yesterday: entry.yesterday,
                    today: entry.today,
                    blockers: entry.blockers ?? "",
                    notes: entry.notes ?? "",
                    progress: entry.progress,
                    status: entry.status,
                  });
                  setTasks(parseTasks(entry.today));
                  setBlockers(parseBlockers(entry.blockers));
                  setEditing(false);
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
                ) : (
                  <Lock className="h-4 w-4" aria-hidden="true" />
                )}
                Lock Daily Plan
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
