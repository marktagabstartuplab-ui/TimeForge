import { SectionCard } from "@/components/shared/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Me } from "../api/account.service";

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  EMPLOYEE: "Employee",
  INTERN: "Intern",
  CONTRACTOR: "Contractor",
  PART_TIME: "Part-time",
  FULL_TIME: "Full-time",
};

/** Derives a stable, human-facing employee code from the UUID — no separate field is persisted for it. */
function employeeCode(id: string): string {
  return `TF-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export function ProfessionalDetailsCard({ me }: { me: Me }) {
  return (
    <SectionCard title="Professional Details">
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="jobTitle" className="mb-1.5">Job Title</Label>
          <Input id="jobTitle" value={me.jobTitle ?? "—"} disabled />
        </div>
        <div>
          <Label htmlFor="department" className="mb-1.5">Department</Label>
          <Input id="department" value={me.department?.name ?? "—"} disabled />
        </div>
        <div>
          <Label htmlFor="employeeId" className="mb-1.5">Employee ID</Label>
          <Input id="employeeId" value={employeeCode(me.id)} disabled />
        </div>
        <div>
          <Label htmlFor="organization" className="mb-1.5">Organization</Label>
          <Input id="organization" value={me.organization.name} disabled />
        </div>
        <div>
          <Label htmlFor="employmentType" className="mb-1.5">Employment Type</Label>
          <Input
            id="employmentType"
            value={EMPLOYMENT_TYPE_LABELS[me.employmentType] ?? me.employmentType}
            disabled
          />
        </div>
      </div>
    </SectionCard>
  );
}
