"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NotebookPen, Loader2 } from "lucide-react";
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
import { listClients, listProjects, listWorkCategories } from "../api/catalog.service";
import { createTimeEntry } from "../api/time-entries.service";
import { manualEntrySchema, type ManualEntryValues } from "../schemas/time-entry.schema";
import { toIsoDate } from "@/lib/time";
import { ApiError } from "@/lib/api/client";

/**
 * "Smart Timesheet" manual entry form (right column of Employee Log Work).
 *
 * BACKEND GAP — the wireframe's "Value & KPI" fields (outcome marker + KPI
 * metric link) have no counterpart on CreateTimeEntryDto, so they are shown
 * disabled with a note instead of being silently dropped.
 */
export function TimeEntryForm() {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: clients } = useQuery({ queryKey: ["catalog", "clients"], queryFn: listClients });
  const { data: projects } = useQuery({ queryKey: ["catalog", "projects"], queryFn: listProjects });
  const { data: categories } = useQuery({
    queryKey: ["catalog", "work-categories"],
    queryFn: listWorkCategories,
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ManualEntryValues>({
    resolver: zodResolver(manualEntrySchema),
    defaultValues: {
      date: toIsoDate(new Date()),
      startTime: "",
      endTime: "",
      clientId: "",
      projectId: "",
      workCategoryId: "",
      description: "",
    },
  });

  const create = useMutation({
    mutationFn: (values: ManualEntryValues) =>
      createTimeEntry({
        startTime: new Date(`${values.date}T${values.startTime}`).toISOString(),
        endTime: new Date(`${values.date}T${values.endTime}`).toISOString(),
        clientId: values.clientId || undefined,
        projectId: values.projectId || undefined,
        workCategoryId: values.workCategoryId || undefined,
        description: values.description,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      reset({ date: toIsoDate(new Date()), startTime: "", endTime: "", clientId: "", projectId: "", workCategoryId: "", description: "" });
      setSaved(true);
    },
    onError: (err) => {
      setSaved(false);
      setServerError(err instanceof ApiError ? err.message : "Could not save the time entry");
    },
  });

  const onSubmit = (values: ManualEntryValues) => {
    setServerError(null);
    setSaved(false);
    create.mutate(values);
  };

  const selectClass = "h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]";

  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-3 border-b border-[#c3c6d2]/40 pb-4">
        <NotebookPen className="h-5 w-5 text-brand" aria-hidden="true" />
        <h3 className="text-xl text-brand-navy">Smart Timesheet</h3>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 space-y-4">
        {serverError ? <FormBanner message={serverError} /> : null}
        {saved ? (
          <p role="status" className="rounded-[8px] bg-[#f0fdf4] px-3 py-2 text-sm text-[#16a34a]">
            Time entry logged.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor="entry-date">Date</FieldLabel>
            <IconInput id="entry-date" type="date" invalid={Boolean(errors.date)} {...register("date")} />
            <FieldError message={errors.date?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="entry-start">Start Time</FieldLabel>
            <IconInput id="entry-start" type="time" invalid={Boolean(errors.startTime)} {...register("startTime")} />
            <FieldError message={errors.startTime?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="entry-end">End Time</FieldLabel>
            <IconInput id="entry-end" type="time" invalid={Boolean(errors.endTime)} {...register("endTime")} />
            <FieldError message={errors.endTime?.message} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor="entry-client">Client</FieldLabel>
            <Controller
              control={control}
              name="clientId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="entry-client" aria-label="Client" className={selectClass}>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div>
            <FieldLabel htmlFor="entry-project">Project</FieldLabel>
            <Controller
              control={control}
              name="projectId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="entry-project" aria-label="Project" className={selectClass}>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div>
            <FieldLabel htmlFor="entry-category">Task Category</FieldLabel>
            <Controller
              control={control}
              name="workCategoryId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="entry-category" aria-label="Task Category" className={selectClass}>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="entry-description">Description of Deliverables</FieldLabel>
          <Textarea
            id="entry-description"
            rows={4}
            placeholder="Detail the specific tasks completed during this session..."
            invalid={Boolean(errors.description)}
            {...register("description")}
          />
          <FieldError message={errors.description?.message} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="entry-outcome">Outcome Marker</FieldLabel>
            <IconInput
              id="entry-outcome"
              type="text"
              placeholder="e.g. Improved load time by 20%"
              disabled
            />
            <p className="mt-1 text-xs text-brand-muted/80">Needs backend support — not on the time entry API yet.</p>
          </div>
          <div>
            <FieldLabel htmlFor="entry-kpi">KPI Metrics</FieldLabel>
            <Select disabled>
              <SelectTrigger id="entry-kpi" aria-label="KPI Metrics" className={selectClass}>
                <SelectValue placeholder="Select KPI" />
              </SelectTrigger>
              <SelectContent />
            </Select>
            <p className="mt-1 text-xs text-brand-muted/80">Needs backend support — KPI links are computed on approval.</p>
          </div>
        </div>

        <div className="flex justify-end border-t border-[#c3c6d2]/40 pt-4">
          <button
            type="submit"
            disabled={create.isPending}
            className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-[#1467d6] disabled:opacity-60"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Log Time Entry
          </button>
        </div>
      </form>
    </div>
  );
}
