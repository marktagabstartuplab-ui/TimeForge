import { apiClient } from "@/lib/api/client";

export type AttendanceStatus = "PERFECT" | "EXCELLENT" | "GOOD" | "CRITICAL";

export interface AttendanceRow {
  userId: string;
  name: string;
  department: string | null;
  daysLogged: number;
  expectedDays: number;
  absences: number;
  tardiness: number;
  attendancePercent: number;
  status: AttendanceStatus;
}

export interface AttendanceReportResponse {
  data: AttendanceRow[];
  page: { page: number; pageSize: number; total: number; totalPages: number };
  period: { from: string; to: string };
  summary: {
    avgAttendanceRate: number;
    totalTardiness: number;
    unexcusedAbsences: number;
    pendingReviews: number;
  };
}

export interface AttendanceReportQuery {
  search?: string;
  departmentId?: string;
  payrollPeriodId?: string;
  from?: string;
  to?: string;
  status?: AttendanceStatus;
  sortBy?: "name" | "attendancePercent" | "absences" | "tardiness" | "daysLogged";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export async function getAttendanceReport(query: AttendanceReportQuery = {}): Promise<AttendanceReportResponse> {
  const { data } = await apiClient.get<AttendanceReportResponse>("/reports/attendance-report", { params: query });
  return data;
}

/** Fetches the audited export file and triggers a client-side download. */
export async function exportAttendanceReport(query: AttendanceReportQuery & { format: "CSV" | "XLSX" | "PDF" }): Promise<void> {
  const endpoint = query.format === "CSV" ? "/reports/attendance-report/export" : "/reports/attendance-report/export";
  const { data: blob } = await apiClient.get<Blob>(endpoint, {
    params: query,
    responseType: "blob",
  });
  const ext = query.format.toLowerCase();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-report.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
