import { apiClient } from "@/lib/api/client";

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "APPROVE"
  | "REJECT"
  | "REVISION_REQUEST"
  | "PAYROLL_EXPORT"
  | "ROLE_CHANGE"
  | "PASSWORD_CHANGE"
  | "AI_USAGE"
  | "SETTINGS_CHANGE"
  | "ADMIN_ACTION";

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  action: AuditAction;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}

export interface AuditLogsPage {
  data: AuditLogEntry[];
  page: { limit: number; hasMore: boolean; nextCursor: string | null };
}

export interface AuditLogsQuery {
  action?: AuditAction;
  q?: string;
  cursor?: string;
  limit?: number;
}

export async function listAuditLogs(query: AuditLogsQuery = {}): Promise<AuditLogsPage> {
  const { data } = await apiClient.get<AuditLogsPage>("/audit-logs", { params: query });
  return data;
}
