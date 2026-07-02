"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/features/auth/components/fields";
import { FieldError, FormBanner } from "@/features/auth/components/FormMessages";
import {
  createScrumEntry,
  updateScrumEntry,
  type ScrumEntry,
} from "@/features/scrum/api/scrum.service";
import { dailyScrumSchema, type DailyScrumValues } from "../schemas/time-entry.schema";
import { toIsoDate } from "@/lib/time";
import { ApiError } from "@/lib/api/client";

interface DailyScrumCardProps {
  /** Today's entry when it already exists (form switches to update mode). */
  entry: ScrumEntry | null;
}

/** Daily Scrum form (bottom of the Time Tracker page). One entry per day. */
export function DailyScrumCard({ entry }: DailyScrumCardProps) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DailyScrumValues>({
    resolver: zodResolver(dailyScrumSchema),
    defaultValues: {
      yesterday: entry?.yesterday ?? "",
      today: entry?.today ?? "",
      blockers: entry?.blockers ?? "",
      notes: entry?.notes ?? "",
    },
  });

  // Re-seed the form when today's entry loads/refreshes.
  useEffect(() => {
    if (entry) {
      reset({
        yesterday: entry.yesterday,
        today: entry.today,
        blockers: entry.blockers ?? "",
        notes: entry.notes ?? "",
      });
    }
  }, [entry, reset]);

  const save = useMutation({
    mutationFn: (values: DailyScrumValues) =>
      entry
        ? updateScrumEntry(entry.id, {
            yesterday: values.yesterday,
            today: values.today,
            blockers: values.blockers || undefined,
            notes: values.notes || undefined,
            version: entry.version,
          })
        : createScrumEntry({
            entryDate: toIsoDate(new Date()),
            yesterday: values.yesterday,
            today: values.today,
            blockers: values.blockers || undefined,
            notes: values.notes || undefined,
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrum-entries"] });
      setSaved(true);
    },
    onError: (err) => {
      setSaved(false);
      setServerError(err instanceof ApiError ? err.message : "Could not save your scrum update");
    },
  });

  const onSubmit = (values: DailyScrumValues) => {
    setServerError(null);
    setSaved(false);
    save.mutate(values);
  };

  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div>
        <h3 className="text-xl text-brand-navy">Daily Scrum</h3>
        <p className="text-sm text-brand-muted">Submit your daily update to keep the team aligned.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 space-y-4">
        {serverError ? <FormBanner message={serverError} /> : null}
        {saved ? (
          <p role="status" className="rounded-[8px] bg-[#f0fdf4] px-3 py-2 text-sm text-[#16a34a]">
            Scrum update {entry ? "updated" : "submitted"}.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <FieldLabel htmlFor="scrum-yesterday">Yesterday&apos;s Accomplishments</FieldLabel>
            <Textarea
              id="scrum-yesterday"
              rows={3}
              placeholder="What did you complete yesterday?"
              invalid={Boolean(errors.yesterday)}
              {...register("yesterday")}
            />
            <FieldError message={errors.yesterday?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="scrum-today">Today&apos;s Focus Tasks</FieldLabel>
            <Textarea
              id="scrum-today"
              rows={3}
              placeholder="What are your main objectives for today?"
              invalid={Boolean(errors.today)}
              {...register("today")}
            />
            <FieldError message={errors.today?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="scrum-blockers">Active Blockers/Issues</FieldLabel>
            <Textarea
              id="scrum-blockers"
              rows={3}
              placeholder="Are there any impediments in your way?"
              invalid={Boolean(errors.blockers)}
              {...register("blockers")}
            />
            <FieldError message={errors.blockers?.message} />
          </div>
          <div>
            <FieldLabel htmlFor="scrum-notes">Notes for Supervisor</FieldLabel>
            <Textarea
              id="scrum-notes"
              rows={3}
              placeholder="Any private notes or context for your manager?"
              invalid={Boolean(errors.notes)}
              {...register("notes")}
            />
            <FieldError message={errors.notes?.message} />
          </div>
        </div>

        <div className="flex justify-end border-t border-[#c3c6d2]/40 pt-4">
          <button
            type="submit"
            disabled={save.isPending}
            className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-[#1467d6] disabled:opacity-60"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {entry ? "Update Scrum" : "Submit Scrum"}
          </button>
        </div>
      </form>
    </div>
  );
}
