"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { importEmployees, type CreateEmployeeInput } from "../api/employee-management.service";
import type { ToastState } from "@/components/shared/Toast";

const ROLES = new Set(["EMPLOYEE", "SUPERVISOR", "HR", "FINANCE", "ADMIN"]);
const EMPLOYMENT_TYPES = new Set(["EMPLOYEE", "INTERN", "CONTRACTOR", "PART_TIME", "FULL_TIME"]);

/** Splits one CSV line respecting double-quoted fields (which may contain commas). */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

interface ParsedCsv {
  rows: CreateEmployeeInput[];
  errors: string[];
}

/** Expects a header row with (case-insensitive) columns: email, firstName, lastName, role, employmentType. */
function parseCsv(text: string): ParsedCsv {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], errors: ["The file is empty."] };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const emailCol = col("email");
  const firstNameCol = col("firstname") >= 0 ? col("firstname") : col("first name");
  const lastNameCol = col("lastname") >= 0 ? col("lastname") : col("last name");
  const roleCol = col("role");
  const employmentTypeCol = col("employmenttype") >= 0 ? col("employmenttype") : col("employment type");

  if (emailCol < 0 || firstNameCol < 0 || lastNameCol < 0 || roleCol < 0) {
    return { rows: [], errors: ["CSV must include email, firstName, lastName, and role columns."] };
  }

  const rows: CreateEmployeeInput[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    const email = fields[emailCol]?.trim();
    const firstName = fields[firstNameCol]?.trim();
    const lastName = fields[lastNameCol]?.trim();
    const role = fields[roleCol]?.trim().toUpperCase();
    const employmentType = (employmentTypeCol >= 0 ? fields[employmentTypeCol]?.trim().toUpperCase() : "") || "EMPLOYEE";

    if (!email || !firstName || !lastName || !role) {
      errors.push(`Row ${i + 1}: missing required field(s).`);
      continue;
    }
    if (!ROLES.has(role)) {
      errors.push(`Row ${i + 1}: unrecognized role "${role}".`);
      continue;
    }
    if (!EMPLOYMENT_TYPES.has(employmentType)) {
      errors.push(`Row ${i + 1}: unrecognized employment type "${employmentType}".`);
      continue;
    }
    rows.push({ email, firstName, lastName, role: role as CreateEmployeeInput["role"], employmentType: employmentType as CreateEmployeeInput["employmentType"] });
  }

  return { rows, errors };
}

export function ImportEmployeesModal({
  open,
  onOpenChange,
  onToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToast: (t: ToastState) => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);

  const submit = useMutation({
    mutationFn: (rows: CreateEmployeeInput[]) => importEmployees(rows),
    onSuccess: (res) => {
      const errors = res.results.filter((r) => r.status === "error");
      onToast(
        errors.length > 0
          ? { message: `Imported ${res.results.length - errors.length}, ${errors.length} failed.`, tone: "error" }
          : { message: `Imported ${res.results.length} employee(s).`, tone: "success" },
      );
      queryClient.invalidateQueries({ queryKey: ["employee-management"] });
      reset();
      onOpenChange(false);
    },
    onError: (err) => {
      onToast({ message: err instanceof ApiError ? err.message : "Import failed.", tone: "error" });
    },
  });

  function reset() {
    setFileName(null);
    setParsed(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setParsed(parseCsv(String(reader.result ?? "")));
    reader.readAsText(file);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <DialogTitle>Import Employees</DialogTitle>
            <DialogDescription>
              Upload a CSV with columns: email, firstName, lastName, role, employmentType (optional, max 100 rows).
            </DialogDescription>
          </div>
          <DialogCloseButton />
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-[12px] border-2 border-dashed border-[#c3c6d2] px-6 py-8 text-center hover:border-brand/40 hover:bg-[#f6f3f4]"
          >
            <Upload className="h-6 w-6 text-brand-muted" aria-hidden="true" />
            <p className="text-sm font-medium text-brand-navy">{fileName ?? "Click to choose a CSV file"}</p>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileSelected} />
          </button>

          {parsed ? (
            <div className="flex flex-col gap-2 rounded-[10px] bg-[#f6f3f4] px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-brand-navy">
                <FileText className="h-4 w-4" aria-hidden="true" />
                {parsed.rows.length} valid row{parsed.rows.length === 1 ? "" : "s"} ready to import
              </div>
              {parsed.errors.length > 0 ? (
                <ul className="max-h-28 overflow-y-auto text-xs text-red-600">
                  {parsed.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => parsed && submit.mutate(parsed.rows)}
              disabled={!parsed || parsed.rows.length === 0 || submit.isPending}
            >
              {submit.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Import {parsed?.rows.length ? `${parsed.rows.length} Employee${parsed.rows.length === 1 ? "" : "s"}` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
