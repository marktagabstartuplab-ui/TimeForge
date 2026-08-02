import { apiClient } from "@/lib/api/client";

export type ShiftViolationType = "REACHED_LIMIT" | "AUTO_CLOCKED_OUT" | "MANUAL_OVERRIDE";
export type ShiftSupervisorAction = "NO_ACTION" | "APPROVED" | "DENIED";

export interface ShiftConfiguration {
  id: string;
  shiftName: string;
  maxShiftMinutes: number;
  gracePeriodMinutes: number;
  warningLeadMinutes: number;
  requiresSupervisorOverride: boolean;
}

export interface ShiftLimitViolation {
  id: string;
  workSessionId: string;
  employeeId: string;
  violationType: ShiftViolationType;
  violationAt: string;
  minutesWorkedAtViolation: number;
  requestedExtensionMinutes: number | null;
  supervisorAction: ShiftSupervisorAction;
  supervisorId: string | null;
  supervisorActionAt: string | null;
  supervisorNote: string | null;
  employee?: { id: string; firstName: string | null; lastName: string | null; email: string };
  workSession?: {
    id: string;
    clockIn: string;
    clockOut: string | null;
    maxClockOutAt: string | null;
    isActive: boolean;
  };
}

export interface ViolationPage {
  data: ShiftLimitViolation[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function getShiftConfig(): Promise<ShiftConfiguration | null> {
  const { data } = await apiClient.get<ShiftConfiguration | null>("/shift-limits/config");
  return data;
}

export async function requestShiftOverride(payload: {
  additionalMinutes: number;
  reason?: string;
}): Promise<ShiftLimitViolation> {
  const { data } = await apiClient.post<ShiftLimitViolation>("/shift-limits/override-requests", payload);
  return data;
}

export async function decideShiftOverride(
  id: string,
  payload: { approved: boolean; additionalMinutes?: number; note?: string },
): Promise<ShiftLimitViolation> {
  const { data } = await apiClient.post<ShiftLimitViolation>(
    `/shift-limits/override-requests/${id}/decision`,
    payload,
  );
  return data;
}

export async function listShiftViolations(params: {
  violationType?: ShiftViolationType;
  supervisorAction?: ShiftSupervisorAction;
  page?: number;
  pageSize?: number;
} = {}): Promise<ViolationPage> {
  const { data } = await apiClient.get<ViolationPage>("/shift-limits/violations", { params });
  return data;
}
