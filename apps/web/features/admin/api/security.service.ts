import { apiClient } from "@/lib/api/client";

export interface SecurityUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string;
}

export interface SecurityLog {
  id: string;
  action: string;
  status: "SUCCESS" | "DENIED" | "PENDING";
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  ipAddress: string;
  geoLocation?: string;
  riskScore: number;
  createdAt: string;
  user?: SecurityUser;
}

export interface SecurityAlert {
  id: string;
  title: string;
  description: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: string;
  ipAddress?: string;
  createdAt: string;
  user?: SecurityUser;
}

export interface SecurityHealth {
  uptimePercent: number;
  uptimeSeconds: number;
  criticalAlerts: number;
  totalSecurityLogs: number;
  compliance: {
    soc2: string;
    gdpr: string;
    lastAuditDate: string;
  };
  lockoutPolicy: {
    maxAttempts: number;
    lockoutDurationMinutes: number;
  };
}

export interface SecurityLogsQuery {
  q?: string;
  status?: string;
  severity?: string;
  timeRange?: string;
  cursor?: string;
  limit?: number;
}

export interface CursorPaginatedLogs {
  data: SecurityLog[];
  page: {
    nextCursor: string | null;
  };
}

export async function getSecurityLogs(query: SecurityLogsQuery): Promise<CursorPaginatedLogs> {
  const { data } = await apiClient.get<CursorPaginatedLogs>("/security/logs", { params: query });
  return data;
}

export async function getSecurityAlerts(): Promise<SecurityAlert[]> {
  const { data } = await apiClient.get<SecurityAlert[]>("/security/alerts");
  return data;
}

export async function getSecurityHealth(): Promise<SecurityHealth> {
  const { data } = await apiClient.get<SecurityHealth>("/security/health");
  return data;
}

export async function exportSecurityLogs(): Promise<Blob> {
  const { data } = await apiClient.post<Blob>("/security/export", { format: "CSV" }, { responseType: "blob" });
  return data;
}
