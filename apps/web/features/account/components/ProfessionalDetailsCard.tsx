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

/** System roles an Admin may promote/demote a user to (mirrors AssignRolesDto). */
const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: "Employee",
  SUPERVISOR: "Supervisor",
  HR: "HR",
  FINANCE: "Finance",
  ADMIN: "Admin",
};

const ROLE_KEYS = ["EMPLOYEE", "SUPERVISOR", "HR", "FINANCE", "ADMIN"] as const;

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
  selectedCompensationType?: string;
  selectedHourlyRate?: string;
  selectedDailyRate?: string;
  selectedDaysPerWeek?: string;
  selectedRoleKey?: string;
  canEditRate?: boolean;
  onDepartmentChange?: (value: string) => void;
  onEmploymentTypeChange?: (value: string) => void;
  onSupervisorChange?: (value: string) => void;
  onCompensationTypeChange?: (value: string) => void;
  onHourlyRateChange?: (value: string) => void;
  onDailyRateChange?: (value: string) => void;
  onDaysPerWeekChange?: (value: string) => void;
  onRoleChange?: (value: string) => void;
}

export function ProfessionalDetailsCard({
  me,
  isEditing = false,
  departments = [],
  supervisors = [],
  selectedDepartmentId,
  selectedEmploymentType,
  selectedSupervisorId,
  selectedCompensationType,
  selectedHourlyRate,
  selectedDailyRate,
  selectedDaysPerWeek,
  selectedRoleKey,
  canEditRate = false,
  onDepartmentChange,
  onEmploymentTypeChange,
  onSupervisorChange,
  onCompensationTypeChange,
  onHourlyRateChange,
  onDailyRateChange,
  onDaysPerWeekChange,
  onRoleChange,
}: ProfessionalDetailsCardProps) {
  const currentCompType = selectedCompensationType ?? me.compensationType ?? "HOURLY";

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
            <Select
              value={selectedDepartmentId ?? me.departmentId ?? "NONE"}
              onValueChange={(v) => onDepartmentChange(v === "NONE" || v === null ? "" : v)}
              items={[
                { value: "NONE", label: "No department" },
                ...departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
            >
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
          <Label className="mb-1.5">Role</Label>
          {isEditing && onRoleChange ? (
            <Select
              value={selectedRoleKey ?? me.roles[0]?.role.key ?? "EMPLOYEE"}
              onValueChange={(v) => onRoleChange(v ?? "")}
              items={ROLE_KEYS.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_KEYS.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="role"
              value={
                me.roles[0]?.role.key
                  ? (ROLE_LABELS[me.roles[0].role.key] ?? me.roles[0].role.name)
                  : "—"
              }
              disabled
            />
          )}
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
            <Select
              value={selectedSupervisorId ?? me.supervisor?.id ?? "NONE"}
              onValueChange={(v) => onSupervisorChange(v === "NONE" || v === null ? "" : v)}
              items={[
                { value: "NONE", label: "No supervisor" },
                ...supervisors.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` })),
              ]}
            >
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

        {/* Rate Configuration / Compensation Basis */}
        {canEditRate && onCompensationTypeChange ? (
          <div className="flex flex-col gap-3 rounded-lg border border-[#c3c6d2]/40 bg-gray-50/50 p-3.5 dark:bg-gray-800/30">
            <div>
              <Label className="mb-1.5 font-medium">Compensation Basis</Label>
              <Select
                value={currentCompType}
                onValueChange={(v) => {
                  // Base UI emits null when the selection is cleared; compensation
                  // basis is required, so ignore that rather than forwarding "".
                  if (v) onCompensationTypeChange(v);
                }}
                items={[
                  { value: "HOURLY", label: "Hourly Rate" },
                  { value: "DAILY", label: "Daily Rate" },
                ]}
              >
                <SelectTrigger className="w-full bg-white dark:bg-gray-900"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOURLY">Hourly Rate</SelectItem>
                  <SelectItem value="DAILY">Daily Rate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {currentCompType === "DAILY" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="dailyRate" className="mb-1.5">Daily Rate (PHP)</Label>
                  <Input
                    id="dailyRate"
                    type="number"
                    min="0"
                    step="0.01"
                    className="bg-white dark:bg-gray-900"
                    value={selectedDailyRate ?? ""}
                    onChange={(e) => onDailyRateChange && onDailyRateChange(e.target.value)}
                    placeholder="e.g. 2000.00"
                  />
                </div>
                <div>
                  <Label htmlFor="daysPerWeek" className="mb-1.5">Days / Week</Label>
                  <Input
                    id="daysPerWeek"
                    type="number"
                    min="1"
                    max="7"
                    step="0.5"
                    className="bg-white dark:bg-gray-900"
                    value={selectedDaysPerWeek ?? "5"}
                    onChange={(e) => onDaysPerWeekChange && onDaysPerWeekChange(e.target.value)}
                    placeholder="5"
                  />
                </div>
              </div>
            ) : (
              <div>
                <Label htmlFor="hourlyRate" className="mb-1.5">Hourly Rate (PHP)</Label>
                <Input
                  id="hourlyRate"
                  type="number"
                  min="0"
                  step="0.01"
                  className="bg-white dark:bg-gray-900"
                  value={selectedHourlyRate ?? ""}
                  onChange={(e) => onHourlyRateChange && onHourlyRateChange(e.target.value)}
                  placeholder="e.g. 250.00"
                />
              </div>
            )}
          </div>
        ) : (
          <div>
            <Label htmlFor="rateConfiguration" className="mb-1.5">Compensation Basis</Label>
            <Input
              id="rateConfiguration"
              value={
                (me.compensationType === "DAILY" || me.dailyRate != null)
                  ? `Daily Basis: ₱${Number(me.dailyRate ?? (Number(me.hourlyRate ?? 0) * 8)).toFixed(2)}/day (${me.daysPerWeek ?? 5} days/wk)`
                  : me.hourlyRate != null
                  ? `Hourly Basis: ₱${Number(me.hourlyRate).toFixed(2)}/hr`
                  : "—"
              }
              disabled
            />
          </div>
        )}
      </div>
    </SectionCard>
  );
}
