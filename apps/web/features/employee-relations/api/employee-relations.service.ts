import { apiClient } from "@/lib/api/client";

export type DisciplineStatus = "ISSUED" | "RESPONDED" | "RESOLVED" | "CLOSED";
export type ClearanceStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

export interface RelationsPerson {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  jobTitle?: string | null;
  department?: { name: string } | null;
}

export interface DisciplineRecord {
  id: string;
  employeeId: string;
  issuerId: string;
  title: string;
  violationDescription: string;
  status: DisciplineStatus;
  employeeResponse?: string | null;
  respondedAt?: string | null;
  issuedAt: string;
  createdAt: string;
  employee?: RelationsPerson;
  issuer?: RelationsPerson;
}

export interface ClearanceItem {
  id: string;
  checklistId: string;
  department: string;
  title: string;
  isApproved: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
}

export interface ClearanceChecklist {
  id: string;
  employeeId: string;
  status: ClearanceStatus;
  initiatedAt: string;
  completedAt?: string | null;
  notes?: string | null;
  employee?: RelationsPerson;
  items: ClearanceItem[];
}

// ── NTE ──────────────────────────────────────────────────────────────────────

export async function createNte(payload: {
  employeeId: string;
  title: string;
  violationDescription: string;
}): Promise<DisciplineRecord> {
  const { data } = await apiClient.post<DisciplineRecord>("/employee-relations/nte", payload);
  return data;
}

/** Omitting `userId` returns the whole org for HR, or just your own records otherwise. */
export async function listNtes(userId?: string): Promise<DisciplineRecord[]> {
  const { data } = await apiClient.get<DisciplineRecord[]>("/employee-relations/nte", {
    params: userId ? { userId } : undefined,
  });
  return data;
}

export async function respondToNte(id: string, response: string): Promise<DisciplineRecord> {
  const { data } = await apiClient.patch<DisciplineRecord>(
    `/employee-relations/nte/${id}/respond`,
    { response },
  );
  return data;
}

// ── Clearance ────────────────────────────────────────────────────────────────

export async function initiateClearance(payload: {
  employeeId: string;
  notes?: string;
}): Promise<ClearanceChecklist> {
  const { data } = await apiClient.post<ClearanceChecklist>("/employee-relations/clearance", payload);
  return data;
}

export async function listClearances(employeeId?: string): Promise<ClearanceChecklist[]> {
  const { data } = await apiClient.get<ClearanceChecklist[]>("/employee-relations/clearance", {
    params: employeeId ? { employeeId } : undefined,
  });
  return data;
}

export async function approveClearanceItem(
  checklistId: string,
  itemId: string,
  notes?: string,
): Promise<ClearanceChecklist> {
  const { data } = await apiClient.patch<ClearanceChecklist>(
    `/employee-relations/clearance/${checklistId}/items/${itemId}/approve`,
    { notes },
  );
  return data;
}
