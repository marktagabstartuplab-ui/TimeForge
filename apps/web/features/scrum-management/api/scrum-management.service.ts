import { apiClient } from "@/lib/api/client";

export interface ScrumDashboard {
  period: { from: string; to: string };
  teamsReporting: { count: number; total: number };
  participationRate: number;
  activeBlockers: { count: number; critical: number };
  submissionTrend: { data: { date: string; count: number }[]; direction: "up" | "down" | "flat" };
  lateSubmissions: number;
  avgBlockerResolutionHours: number | null;
  recentSubmissions: {
    id: string;
    userId: string;
    name: string;
    department: string | null;
    completionPercent: number;
    status: string;
    submittedAt: string;
  }[];
  teamStatus: {
    teamId: string;
    name: string;
    memberCount: number;
    submittedCount: number;
    completionPercent: number;
    hasActiveBlocker: boolean;
  }[];
}

export interface ScrumBlockerRow {
  id: string;
  title: string;
  description: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  resolvedAt: string | null;
  employeeName: string;
  team: string | null;
  department: string | null;
  entryDate: string;
}

export interface ScrumBlockersPage {
  data: ScrumBlockerRow[];
  page: { limit: number; hasMore: boolean; nextCursor: string | null };
}

export interface ScrumParticipation {
  period: { from: string; to: string };
  overall: number;
  byDepartment: { departmentId: string; name: string; total: number; submitted: number; participationRate: number }[];
}

export interface ScrumHeatmap {
  days: string[];
  departments: { departmentId: string; name: string; values: number[]; avg: number }[];
}

export interface ScrumTrends {
  days: number;
  data: { date: string; submitted: number; total: number; rate: number }[];
}

export async function getScrumDashboard(): Promise<ScrumDashboard> {
  const { data } = await apiClient.get<ScrumDashboard>("/scrum/dashboard");
  return data;
}

export async function getScrumBlockers(params: { severity?: string; status?: string } = {}): Promise<ScrumBlockersPage> {
  const { data } = await apiClient.get<ScrumBlockersPage>("/scrum/blockers", { params });
  return data;
}

export async function getScrumParticipation(): Promise<ScrumParticipation> {
  const { data } = await apiClient.get<ScrumParticipation>("/scrum/participation");
  return data;
}

export async function getScrumHeatmap(week: "current" | "previous" = "current"): Promise<ScrumHeatmap> {
  const { data } = await apiClient.get<ScrumHeatmap>("/scrum/heatmap", { params: { week } });
  return data;
}

export async function getScrumTrends(days = 14): Promise<ScrumTrends> {
  const { data } = await apiClient.get<ScrumTrends>("/scrum/trends", { params: { days } });
  return data;
}

export interface ScrumEntryDetail {
  id: string;
  userId: string;
  entryDate: string;
  yesterday: string;
  today: string;
  blockers: string | null;
  notes: string | null;
  progress: number;
  status: string;
  isLocked: boolean;
  submittedAt: string | null;
  supervisorNote: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  recurringBlocker?: boolean;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    avatarKey: string | null;
    department: { name: string } | null;
  };
  tasks: {
    id: string;
    title: string;
    taskStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED";
    priority: "LOW" | "MEDIUM" | "HIGH";
  }[];
  blockerItems: {
    id: string;
    title: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    status: "OPEN" | "RESOLVED";
  }[];
}

export interface TeamScrumsResponse {
  data: ScrumEntryDetail[];
  total: number;
  limit: number;
}

export async function getTeamScrums(params: {
  search?: string;
  from?: string;
  to?: string;
  hasBlockers?: string;
  limit?: number;
}): Promise<TeamScrumsResponse> {
  const { data } = await apiClient.get<TeamScrumsResponse>("/scrum/team", { params });
  return data;
}

export async function postScrumComment(id: string, comment: string, version: number): Promise<void> {
  await apiClient.post(`/scrum/${id}/comment`, { comment, version });
}

export async function postScrumFlag(id: string, version: number): Promise<void> {
  await apiClient.post(`/scrum/${id}/flag`, { version });
}

/**
 * Supervisor unlocks a team member's locked Today's Commitment so they can edit
 * it again. A reason (min 5 chars) is required and recorded in the audit log.
 */
export async function postScrumUnlock(id: string, reason: string): Promise<void> {
  await apiClient.post(`/scrum/${id}/unlock`, { reason });
}
