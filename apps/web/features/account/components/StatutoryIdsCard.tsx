"use client";

import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { SectionCard } from "@/components/shared/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/features/auth/components/FormMessages";
import type { ProfileValues } from "../schemas/account.schema";
import {
  maskStatutoryId,
  STATUTORY_ID_SPECS,
  type StatutoryIdField,
} from "../lib/statutory-ids";

interface StatutoryIdsCardProps {
  register: UseFormRegister<ProfileValues>;
  setValue: UseFormSetValue<ProfileValues>;
  watch: UseFormWatch<ProfileValues>;
  errors: FieldErrors<ProfileValues>;
  readOnly?: boolean;
}

const FIELDS: { name: StatutoryIdField; label: string }[] = [
  { name: "tin", label: "TIN (Tax Identification Number)" },
  { name: "sssNumber", label: "SSS Number" },
  { name: "philhealthNumber", label: "PhilHealth Number" },
  { name: "pagibigNumber", label: "Pag-IBIG (HDMF) Number" },
];

export function StatutoryIdsCard({
  register,
  setValue,
  watch,
  errors,
  readOnly = false,
}: StatutoryIdsCardProps) {
  const handleInputChange = (
    field: StatutoryIdField,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const raw = e.target.value;
    const masked = maskStatutoryId(field, raw);
    setValue(field, masked, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <SectionCard title='Philippine Statutory IDs ("201 File")'>
      <div className="flex flex-col gap-4">
        {FIELDS.map(({ name, label }) => {
          const spec = STATUTORY_ID_SPECS[name];
          const val = watch(name) ?? "";
          const errorMsg = errors[name]?.message;

          return (
            <div key={name}>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor={name}>{label}</Label>
                <span className="text-[11px] text-brand-muted">{spec.hint}</span>
              </div>
              <Input
                id={name}
                value={val}
                placeholder={spec.placeholder}
                disabled={readOnly}
                aria-invalid={Boolean(errorMsg)}
                {...register(name)}
                onChange={(e) => handleInputChange(name, e)}
              />
              <FieldError message={errorMsg} />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
