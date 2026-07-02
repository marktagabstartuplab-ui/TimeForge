"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api/client";
import {
  Dialog,
  DialogClose,
  DialogCloseButton,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/features/auth/components/fields";
import { FormBanner } from "@/features/auth/components/FormMessages";
import { listClients, listProjects, listWorkCategories } from "../api/catalog.service";
import type { TimeEntry } from "../api/time-entries.service";

interface EditSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: TimeEntry;
}

/**
 * Task-switch dialog for the running session: updates project/client/category
 * and description in place via PATCH /time-entries/:id.
 */
export function EditSessionDialog({ open, onOpenChange, entry }: EditSessionDialogProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(entry.projectId ?? "");
  const [clientId, setClientId] = useState(entry.clientId ?? "");
  const [workCategoryId, setWorkCategoryId] = useState(entry.workCategoryId ?? "");
  const [description, setDescription] = useState(entry.description ?? "");

  const { data: clients } = useQuery({ queryKey: ["catalog", "clients"], queryFn: listClients });
  const { data: projects } = useQuery({ queryKey: ["catalog", "projects"], queryFn: listProjects });
  const { data: categories } = useQuery({
    queryKey: ["catalog", "work-categories"],
    queryFn: listWorkCategories,
  });

  const save = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.patch<TimeEntry>(`/time-entries/${entry.id}`, {
        projectId: projectId || undefined,
        clientId: clientId || undefined,
        workCategoryId: workCategoryId || undefined,
        description: description || undefined,
        version: entry.version,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      onOpenChange(false);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Could not update the session"),
  });

  const selectClass = "h-11 w-full rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-[15px]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(480px,calc(100vw-2rem))]" aria-describedby={undefined}>
        <div className="flex items-center justify-between border-b border-[#c3c6d2]/40 px-6 py-4">
          <DialogTitle className="text-xl font-bold text-brand-navy">Edit Session Context</DialogTitle>
          <DialogCloseButton />
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {error ? <FormBanner message={error} /> : null}

          <div>
            <FieldLabel htmlFor="session-client">Client</FieldLabel>
            <Select value={clientId} onValueChange={(v) => setClientId((v as string) ?? "")}>
              <SelectTrigger id="session-client" aria-label="Client" className={selectClass}>
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
          </div>

          <div>
            <FieldLabel htmlFor="session-project">Project</FieldLabel>
            <Select value={projectId} onValueChange={(v) => setProjectId((v as string) ?? "")}>
              <SelectTrigger id="session-project" aria-label="Project" className={selectClass}>
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
          </div>

          <div>
            <FieldLabel htmlFor="session-category">Task Category</FieldLabel>
            <Select value={workCategoryId} onValueChange={(v) => setWorkCategoryId((v as string) ?? "")}>
              <SelectTrigger id="session-category" aria-label="Task Category" className={selectClass}>
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
          </div>

          <div>
            <FieldLabel htmlFor="session-description">What are you working on?</FieldLabel>
            <Textarea
              id="session-description"
              rows={3}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description of the current task..."
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#c3c6d2]/40 px-6 py-4">
          <DialogClose className="rounded-[10px] px-4 py-2 text-sm font-bold text-brand-ink hover:bg-[#f6f3f4]">
            Cancel
          </DialogClose>
          <button
            type="button"
            onClick={() => {
              setError(null);
              save.mutate();
            }}
            disabled={save.isPending}
            className="flex h-10 items-center gap-2 rounded-[10px] bg-brand px-5 text-sm font-bold text-white hover:bg-[#1467d6] disabled:opacity-60"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Save Session
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
