import { apiClient } from "@/lib/api/client";

export interface RecurringIssue {
  id: string;
  category: "BLOCKER" | "DELAY";
  issueText: string;
  departmentId: string | null;
  projectId: string | null;
  employeeIds: string[];
  occurrenceCount: number;
  firstOccurrence: string;
  lastOccurrence: string;
  trend: "INCREASING" | "STABLE" | "DECREASING";
  suggestedAction: string | null;
  status: "OPEN" | "RESOLVED";
}

export interface RecurringIssueQuery {
  departmentId?: string;
  projectId?: string;
  from?: string;
  to?: string;
  status?: "OPEN" | "RESOLVED";
}

export interface RecurringIssueSummary {
  total: number;
  blockers: number;
  delays: number;
  increasing: number;
}

export async function listRecurringIssues(query: RecurringIssueQuery = {}): Promise<RecurringIssue[]> {
  const { data } = await apiClient.get<RecurringIssue[]>("/recurring-issues", { params: query });
  return data;
}

export async function getRecurringIssuesSummary(): Promise<RecurringIssueSummary> {
  const { data } = await apiClient.get<RecurringIssueSummary>("/recurring-issues/summary");
  return data;
}
