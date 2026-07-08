import { apiClient } from "@/lib/api/client";

export interface HrAiInsightsResponse {
  summaryCards: {
    activePayrollCycle: { label: string; startDate: string; endDate: string; status: string } | null;
    estimatedWorkforceCost: number;
    totalEmployees: number;
    timesheetCompliance: number;
    aiEfficiencyGain: number;
  };
  payrollOversight: {
    dataSync: { status: "COMPLETED" | "IN_PROGRESS" | "PENDING"; lastSync: string | null };
    aiValidation: { status: "COMPLETED" | "IN_PROGRESS" | "PENDING"; lastRun: string | null };
    payrollProcessing: { status: "COMPLETED" | "IN_PROGRESS" | "PENDING"; progress: number };
    readyForFinance: { status: "READY" | "NOT_READY" | "IN_PROGRESS"; reportCount: number };
  };
  aiActionCenter: {
    totalAlerts: number;
    items: Array<{
      id: string;
      type: "PAYROLL_ALERT" | "ATTENDANCE_ANOMALY" | "COMPLIANCE_RISK" | "CRITICAL_ERROR" | "RECOMMENDED_ACTION";
      severity: "HIGH" | "MEDIUM" | "LOW";
      title: string;
      description: string;
      timestamp: string;
    }>;
  };
  timesheetStatus: Array<{
    id: string;
    employee: string;
    department: string;
    period: string;
    status: string;
    aiFlagged: boolean;
    validationResult: string;
  }>;
  attendanceTrends: Array<{
    week: string;
    submissionRate: number;
    approvalRate: number;
    anomalies: number;
  }>;
}

export async function getHrAiInsights(): Promise<HrAiInsightsResponse> {
  const { data } = await apiClient.get<HrAiInsightsResponse>("/dashboard/hr/ai-insights");
  return data;
}
