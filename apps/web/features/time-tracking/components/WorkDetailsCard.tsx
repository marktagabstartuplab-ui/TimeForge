"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, NotebookPen, Paperclip, X, Zap } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel, IconInput } from "@/features/auth/components/fields";
import { FieldError, FormBanner } from "@/features/auth/components/FormMessages";
import type { ToastState } from "@/components/shared/Toast";
import { listClients, listProjects, listWorkCategories } from "../api/catalog.service";
import { updateTimeEntry, type TimeEntry } from "../api/time-entries.service";
import { workDetailsSchema, type WorkDetailsValues } from "../schemas/time-entry.schema";
import { composeDescription, splitDescription, type WorkTask } from "../lib/task-select";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface WorkDetailsCardProps {
  /** The currently running timer entry, or null when idle. */
  running: TimeEntry | null;
  /** Quick Select choice — populates the form when it changes. */
  selectedTask: WorkTask | null;
  /** Employee's department name (auto from profile, read-only). */
  departmentName: string | null;
  onToast: (toast: ToastState) => void;
}

/**
 * Section 3 — Work Details. Saves context onto the *running* time entry via
 * PATCH /time-entries/:id: Task + Work Description are composed into the
 * single `description` field (first line = task, rest = description), and
 * Attachments map to `referenceLinks` (URL list).
 *
 * BACKEND GAPS — Department is a profile attribute (not per-entry), so it's
 * shown read-only; file uploads have no employee-facing endpoint, so
 * attachments accept URLs only. TODO: wire real uploads when available.
 */
export function WorkDetailsCard({ running, selectedTask, departmentName, onToast }: WorkDetailsCardProps) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [links, setLinks] = useState<string[]>(running?.referenceLinks ?? []);
  const [newLink, setNewLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const { data: clients } = useQuery({ queryKey: ["catalog", "clients"], queryFn: listClients });
  const { data: projects } = useQuery({ queryKey: ["catalog", "projects"], queryFn: listProjects });
  const { data: categories } = useQuery({
    queryKey: ["catalog", "work-categories"],
    queryFn: listWorkCategories,
  });

  const initial = splitDescription(running?.description ?? null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<WorkDetailsValues>({
    resolver: zodResolver(workDetailsSchema),
    defaultValues: {
      task: initial.task,
      workDescription: initial.details,
      clientId: running?.clientId ?? "",
      projectId: running?.projectId ?? "",
      workCategoryId: running?.workCategoryId ?? "",
    },
  });

  // Quick Select populates the form (one click → Work Details filled).
  useEffect(() => {
    if (!selectedTask) return;
    reset({
      task: selectedTask.title,
      workDescription: selectedTask.details,
      clientId: selectedTask.clientId ?? "",
      projectId: selectedTask.projectId ?? "",
      workCategoryId: selectedTask.workCategoryId ?? "",
    });
  }, [selectedTask, reset]);

  const save = useMutation({
    mutationFn: async (values: WorkDetailsValues) => {
      if (!running) throw new Error("No running session");
      return updateTimeEntry(running.id, {
        projectId: values.projectId || undefined,
        clientId: values.clientId || undefined,
        workCategoryId: values.workCategoryId || undefined,
        description: composeDescription(values.task ?? "", values.workDescription ?? ""),
        referenceLinks: links,
        version: running.version,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      setServerError(null);
      onToast({ message: "Work details saved to the running session." });
    },
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : "Could not update the session");
    },
  });

  const addLink = () => {
    const candidate = newLink.trim();
    if (!candidate) return;
    try {
      const url = new URL(candidate);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      setLinkError("Enter a valid http(s) URL");
      return;
    }
    setLinkError(null);
    setLinks((prev) => (prev.includes(candidate) ? prev : [...prev, candidate]));
    setNewLink("");
  };

  const selectClass = "h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]";
  const toItems = (list: { id: string; name: string }[] | undefined) =>
    (list ?? []).map((x) => ({ value: x.id, label: x.name }));

  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-3 border-b border-[#c3c6d2]/40 pb-4">
        <NotebookPen className="h-5 w-5 text-brand" aria-hidden="true" />
        <h3 className="text-xl text-brand-navy">Work Details</h3>
      </div>

      {!running ? (
        <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f6f3f4] text-brand-muted">
            <Zap className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-brand-ink">No active session</p>
          <p className="max-w-xs text-xs text-brand-muted">
            Pick a task from Quick Select and click <strong>Clock In</strong> — its details will
            be editable here while the session runs.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="mt-5 space-y-6">
          {serverError ? <FormBanner message={serverError} /> : null}

          {/* Client / Project / Department */}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.8px] text-brand-muted">
              Session Context
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(
              [
                { name: "clientId" as const, label: "Client", items: toItems(clients) },
                { name: "projectId" as const, label: "Project", items: toItems(projects) },
              ]
            ).map((f) => (
              <div key={f.name}>
                <FieldLabel htmlFor={`wd-${f.name}`}>{f.label}</FieldLabel>
                <Controller
                  control={control}
                  name={f.name}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ""}
                      onValueChange={(v) => field.onChange(v ?? "")}
                      items={f.items}
                    >
                      <SelectTrigger id={`wd-${f.name}`} aria-label={f.label} className={selectClass}>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {f.items.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            ))}
            </div>

            {/* Department (profile, read-only) */}
            <div className="mt-4">
              <FieldLabel htmlFor="wd-department">Department</FieldLabel>
              <input
                id="wd-department"
                type="text"
                disabled
                value={departmentName ?? "No Department Assigned"}
                className={cn(
                  "h-11 w-full rounded-[10px] border border-[#c3c6d2] bg-[#f6f3f4] px-3.5 text-[15px] text-brand-muted",
                  "cursor-not-allowed",
                )}
              />
              <p className="mt-1 text-xs text-brand-muted/70">Auto-filled from your profile.</p>
            </div>
          </div>

          {/* Task / Work Category */}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.8px] text-brand-muted">
              Task &amp; Category
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="wd-task">Task</FieldLabel>
                <IconInput
                  id="wd-task"
                  type="text"
                  placeholder="e.g. UI Refactoring"
                  invalid={Boolean(errors.task)}
                  {...register("task")}
                />
                <FieldError message={errors.task?.message} />
              </div>

              <div>
                <FieldLabel htmlFor="wd-workCategoryId">Work Category</FieldLabel>
                <Controller
                  control={control}
                  name="workCategoryId"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ""}
                      onValueChange={(v) => field.onChange(v ?? "")}
                      items={toItems(categories)}
                    >
                      <SelectTrigger id="wd-workCategoryId" aria-label="Work Category" className={selectClass}>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {toItems(categories).map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Description / Attachments */}
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.8px] text-brand-muted">
              Description &amp; Links
            </p>

            <div>
              <FieldLabel htmlFor="wd-workDescription">Work Description</FieldLabel>
              <Textarea
                id="wd-workDescription"
                rows={3}
                placeholder="Detail the specific work for this session..."
                invalid={Boolean(errors.workDescription)}
                {...register("workDescription")}
              />
              <FieldError message={errors.workDescription?.message} />
            </div>

          {/* Attachments — reference links on the time entry. */}
          <div>
            <FieldLabel htmlFor="wd-attachment">Attachments</FieldLabel>
            {links.length > 0 ? (
              <ul className="mb-2 flex flex-col gap-1.5">
                {links.map((link) => (
                  <li
                    key={link}
                    className="flex items-center gap-2 rounded-[8px] bg-[#f6f3f4] px-3 py-1.5 text-xs"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-brand hover:underline"
                    >
                      {link}
                    </a>
                    <button
                      type="button"
                      aria-label={`Remove ${link}`}
                      onClick={() => setLinks((prev) => prev.filter((l) => l !== link))}
                      className="rounded-full p-0.5 text-brand-muted hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <IconInput
                id="wd-attachment"
                type="url"
                icon={Paperclip}
                placeholder="Paste a link (design, PR, doc)..."
                value={newLink}
                onChange={(e) => {
                  setNewLink(e.target.value);
                  setLinkError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLink();
                  }
                }}
              />
              <button
                type="button"
                onClick={addLink}
                className="h-11 shrink-0 rounded-[10px] border border-[#c3c6d2]/60 bg-white px-4 text-sm font-bold text-brand-navy hover:bg-[#f6f3f4]"
              >
                Add
              </button>
            </div>
            {linkError ? <FieldError message={linkError} /> : null}
            {/*
             * TODO: Replace URL-only attachments with real file upload once an
             * employee-facing POST /storage/upload endpoint is available. The backend
             * UploadService exists (apps/api/src/modules/storage/upload.service.ts)
             * but is not exposed via an employee-scoped controller.
             */}
            <p className="mt-1 text-xs text-brand-muted/70">
              Links are saved with this session. File uploads need backend support.
            </p>
          </div>
          </div>

          <div className="flex justify-end border-t border-[#c3c6d2]/40 pt-4">
            <button
              type="submit"
              disabled={save.isPending}
              className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-[#1467d6] disabled:opacity-60"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Save Work Details
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
