import { SectionCard } from "@/components/shared/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Me } from "../api/account.service";

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  EMPLOYEE: "Employee",
  INTERN: "Intern",
  CONTRACTOR: "Contractor",
  PART_TIME: "Part-time",
  FULL_TIME: "Full-time",
};

const EMPLOYMENT_TYPES = ["EMPLOYEE", "INTERN", "CONTRACTOR", "PART_TIME", "FULL_TIME"] as const;

/** Derives a stable, human-facing employee code from the UUID — no separate field is persisted for it. */
function employeeCode(id: string): string {
  return `TF-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

interface DepartmentRef {
  id: string;
  name: string;
}

interface SupervisorRef {
  id: string;
  firstName: string;
  lastName: string;
}

interface ProfessionalDetailsCardProps {
  me: Me;
  isEditing?: boolean;
  departments?: DepartmentRef[];
  supervisors?: SupervisorRef[];
  selectedDepartmentId?: string;
  selectedEmploymentType?: string;
  selectedSupervisorId?: string;
  onDepartmentChange?: (value: string) => void;
  onEmploymentTypeChange?: (value: string) => void;
  onSupervisorChange?: (value: string) => void;
}

export function ProfessionalDetailsCard({
  me,
  isEditing = false,
  departments = [],
  supervisors = [],
  selectedDepartmentId,
  selectedEmploymentType,
  selectedSupervisorId,
  onDepartmentChange,
  onEmploymentTypeChange,
  onSupervisorChange,
}: ProfessionalDetailsCardProps) {
  return (
    <SectionCard title="Professional Details">
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="jobTitle" className="mb-1.5">Job Title</Label>
          <Input id="jobTitle" value={me.jobTitle ?? "—"} disabled />
        </div>

        <div>
          <Label className="mb-1.5">Department</Label>
          {isEditing && onDepartmentChange ? (
            <Select value={selectedDepartmentId ?? me.departmentId ?? "NONE"} onValueChange={(v) => onDepartmentChange(v === "NONE" || v === null ? "" : v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No department</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input id="department" value={me.department?.name ?? "—"} disabled />
          )}
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
          <Label className="mb-1.5">Employment Type</Label>
          {isEditing && onEmploymentTypeChange ? (
            <Select value={selectedEmploymentType ?? me.employmentType} onValueChange={(v) => onEmploymentTypeChange(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((et) => (
                  <SelectItem key={et} value={et}>{EMPLOYMENT_TYPE_LABELS[et]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="employmentType"
              value={EMPLOYMENT_TYPE_LABELS[me.employmentType] ?? me.employmentType}
              disabled
            />
          )}
        </div>

        <div>
          <Label className="mb-1.5">Supervisor</Label>
          {isEditing && onSupervisorChange ? (
            <Select value={selectedSupervisorId ?? me.supervisor?.id ?? "NONE"} onValueChange={(v) => onSupervisorChange(v === "NONE" || v === null ? "" : v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No supervisor</SelectItem>
                {supervisors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="supervisor"
              value={me.supervisor ? `${me.supervisor.firstName} ${me.supervisor.lastName}` : "—"}
              disabled
            />
          )}
        </div>
      </div>
    </SectionCard>
  );
}
