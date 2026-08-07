"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldAlert, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { submitGrievance, type GrievanceCategory } from "../api/grievances.service";

const CATEGORY_OPTIONS: { value: GrievanceCategory; label: string }[] = [
  { value: "WORKPLACE_ENVIRONMENT", label: "Workplace Environment" },
  { value: "COLLEAGUE_ISSUE", label: "Colleague Issue / Conduct" },
  { value: "PAYROLL_DISPUTE", label: "Payroll / Compensation Dispute" },
  { value: "HARASSMENT", label: "Harassment or Discrimination" },
  { value: "SAFETY_CONCERN", label: "Safety & Health Concern" },
  { value: "MANAGEMENT_ISSUE", label: "Management / Supervisor Issue" },
  { value: "OTHER", label: "Other Workplace Concern" },
];

export function SubmitGrievanceModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<GrievanceCategory>("WORKPLACE_ENVIRONMENT");
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: submitGrievance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grievances"] });
      setSubject("");
      setDescription("");
      setIsAnonymous(false);
      setErrorMsg(null);
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err?.message || "Failed to submit complaint.");
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      setErrorMsg("Subject and Description are required.");
      return;
    }
    mutation.mutate({
      subject: subject.trim(),
      category,
      description: description.trim(),
      isAnonymous,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-[16px] bg-white p-6 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#c3c6d2]/40 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-red-50 text-red-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand-navy">Submit a Complaint / Grievance</h2>
              <p className="text-xs text-brand-muted">Private channel routed directly to HR only.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xl font-bold leading-none text-brand-muted hover:text-brand-navy"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          {errorMsg ? (
            <div className="rounded-[8px] bg-red-50 p-3 text-xs text-red-700 font-medium">
              {errorMsg}
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-brand-navy">Subject</label>
            <Input
              placeholder="Brief title summarizing your complaint…"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-10 text-sm"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-brand-navy">Category</label>
            <Select value={category} onValueChange={(v) => setCategory(v as GrievanceCategory)} items={CATEGORY_OPTIONS}>
              <SelectTrigger className="h-10 text-sm border-[#c3c6d2]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-brand-navy">Description / Details</label>
            <textarea
              rows={5}
              placeholder="Provide specific details about the issue. Please include dates, locations, or names if relevant…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-[10px] border border-[#c3c6d2] p-3 text-sm outline-none focus:border-brand"
              required
            />
          </div>

          <div className="flex items-center gap-3 rounded-[10px] bg-slate-50 p-3 border border-slate-200">
            <input
              type="checkbox"
              id="anonymous-checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
            />
            <label htmlFor="anonymous-checkbox" className="cursor-pointer select-none text-xs text-brand-navy">
              <div className="font-semibold flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-brand" /> Submit Anonymously
              </div>
              <p className="text-[11px] text-brand-muted">
                When checked, your name and employee ID will be hidden from HR inbox views.
              </p>
            </label>
          </div>

          <div className="mt-2 flex justify-end gap-2 border-t border-[#c3c6d2]/40 pt-4">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={mutation.isPending}
              className="bg-brand text-white hover:bg-brand-dark"
            >
              {mutation.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
              )}
              Submit Complaint
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
