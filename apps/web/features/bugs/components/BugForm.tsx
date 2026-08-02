"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, Info, X } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { FieldLabel, IconInput } from "@/features/auth/components/fields";
import { FieldError } from "@/features/auth/components/FormMessages";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/lib/api/client";
import { bugReportSchema, BUG_SEVERITIES, type BugReportValues } from "../schemas/bug.schema";
import { createBug, uploadBugAttachment, type BugSeverity } from "../api/bugs.service";

// Base UI's SelectValue renders the raw value unless Root is given an items map.
const SEVERITY_ITEMS = BUG_SEVERITIES.map((s) => ({ value: s.value as string, label: s.label }));

/**
 * Report form. The bug row is created first, then any picked files are uploaded
 * against its id — attachments need a bug to hang off, same "attach after
 * create" flow the leave request drawer uses.
 */
export function BugForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<BugReportValues>({
    resolver: zodResolver(bugReportSchema),
    defaultValues: {
      title: "",
      whereItHappens: "",
      issue: "",
      whoAffected: "",
      whatISee: "",
      expected: "",
      errorMessage: "",
      severity: "P3",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: BugReportValues) => {
      const bug = await createBug({
        title: values.title,
        issue: values.issue,
        whoAffected: values.whoAffected,
        whatISee: values.whatISee,
        expected: values.expected,
        errorMessage: values.errorMessage || undefined,
        whereItHappens: values.whereItHappens,
        severity: values.severity as BugSeverity,
      });

      // A failed upload must not lose the report — surface it and keep going.
      for (const file of files) {
        try {
          await uploadBugAttachment(bug.id, file);
        } catch {
          setUploadNote(`"${file.name}" could not be attached. You can add it from the bug page.`);
        }
      }
      return bug;
    },
    onSuccess: (bug) => {
      queryClient.invalidateQueries({ queryKey: ["bugs"] });
      router.push(`/bugs/${bug.id}`);
    },
    onError: (err) => {
      setErrorMessage(err instanceof ApiError ? err.message : "Failed to submit the bug report.");
    },
  });

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    const tooBig = picked.filter((f) => f.size > 10 * 1024 * 1024);
    if (tooBig.length) {
      setUploadNote(`Skipped ${tooBig.map((f) => f.name).join(", ")} — each file must be under 10 MB.`);
    }
    setFiles((prev) => [...prev, ...picked.filter((f) => f.size <= 10 * 1024 * 1024)]);
    e.target.value = "";
  };

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="flex flex-col gap-6">
      {errorMessage ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-[10px] border border-red-300 bg-red-50 p-3 text-[13px] text-red-700"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <SectionCard title="What Happened">
        <div className="flex flex-col gap-5 p-4">
          <div>
            <FieldLabel htmlFor="bug-title">Title</FieldLabel>
            <IconInput
              id="bug-title"
              placeholder="Short summary, e.g. Timesheet submit button does nothing"
              invalid={Boolean(errors.title)}
              {...register("title")}
            />
            <FieldError message={errors.title?.message} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="bug-where">Where It Happens</FieldLabel>
              <IconInput
                id="bug-where"
                placeholder="Page or screen, e.g. /timesheets"
                invalid={Boolean(errors.whereItHappens)}
                {...register("whereItHappens")}
              />
              <FieldError message={errors.whereItHappens?.message} />
            </div>
            <div>
              <FieldLabel htmlFor="bug-severity">Severity</FieldLabel>
              <Controller
                control={control}
                name="severity"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} items={SEVERITY_ITEMS}>
                    <SelectTrigger
                      id="bug-severity"
                      aria-label="Severity"
                      aria-invalid={Boolean(errors.severity)}
                      className="h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]"
                    >
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUG_SEVERITIES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.severity?.message} />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="bug-issue">The Issue</FieldLabel>
            <Textarea
              id="bug-issue"
              rows={3}
              placeholder="Describe the problem in one or two sentences."
              invalid={Boolean(errors.issue)}
              {...register("issue")}
            />
            <FieldError message={errors.issue?.message} />
          </div>

          <div>
            <FieldLabel htmlFor="bug-who">Who Is Affected</FieldLabel>
            <Textarea
              id="bug-who"
              rows={2}
              placeholder="Just you? Your whole team? Every employee?"
              invalid={Boolean(errors.whoAffected)}
              {...register("whoAffected")}
            />
            <FieldError message={errors.whoAffected?.message} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Expected vs Actual">
        <div className="flex flex-col gap-5 p-4">
          <div>
            <FieldLabel htmlFor="bug-actual">What I See</FieldLabel>
            <Textarea
              id="bug-actual"
              rows={3}
              placeholder="What actually happens when you do it."
              invalid={Boolean(errors.whatISee)}
              {...register("whatISee")}
            />
            <FieldError message={errors.whatISee?.message} />
          </div>

          <div>
            <FieldLabel htmlFor="bug-expected">What I Expected</FieldLabel>
            <Textarea
              id="bug-expected"
              rows={3}
              placeholder="What should have happened instead."
              invalid={Boolean(errors.expected)}
              {...register("expected")}
            />
            <FieldError message={errors.expected?.message} />
          </div>

          <div>
            <FieldLabel htmlFor="bug-error">Error Message (Optional)</FieldLabel>
            <Textarea
              id="bug-error"
              rows={2}
              placeholder="Paste any on-screen error text here."
              {...register("errorMessage")}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Attachments (Optional)">
        <div className="flex flex-col gap-3 p-4">
          <label
            htmlFor="bug-files"
            className="flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed border-[#c3c6d2] bg-white px-6 py-8 text-center hover:border-brand"
          >
            <CloudUpload className="h-6 w-6 text-brand" aria-hidden="true" />
            <span className="text-[13px] font-medium text-brand-ink">
              Click to add screenshots or logs (≤10 MB each)
            </span>
            <input
              id="bug-files"
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.zip"
              className="sr-only"
              onChange={onFilesPicked}
            />
          </label>

          {uploadNote ? <p className="text-xs text-amber-600">{uploadNote}</p> : null}

          {files.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-[10px] border border-[#c3c6d2] bg-white px-3 py-2 text-sm"
                >
                  <span className="truncate text-brand-ink">{f.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="shrink-0 rounded p-1 text-brand-muted hover:bg-[#f6f3f4]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </SectionCard>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-[10px] px-5 py-2.5 text-sm font-bold text-brand-ink hover:bg-[#f6f3f4]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-[10px] bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-[#1467d6] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {mutation.isPending ? "Submitting…" : "Submit Bug Report"}
        </button>
      </div>
    </form>
  );
}
