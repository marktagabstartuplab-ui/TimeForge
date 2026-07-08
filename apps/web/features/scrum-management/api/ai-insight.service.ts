import { apiClient, ApiError } from "@/lib/api/client";

export type AiJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface AiJob {
  id: string;
  feature: string;
  status: AiJobStatus;
  subjectType: string;
  subjectId: string;
  totalTokens: number | null;
  latencyMs: number | null;
  errorMsg: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiResult {
  id: string;
  summary: string;
  recommendation: string;
  confidence: number;
  createdAt: string;
}

/** Triggers the real SUPERVISOR_ADVISORY AI job for the caller's own team. Returns 202 + jobId. */
export async function triggerSupervisorAdvisory(userId: string): Promise<{ jobId: string; status: AiJobStatus }> {
  const { data } = await apiClient.post<{ jobId: string; status: AiJobStatus }>(
    "/ai/jobs",
    { feature: "SUPERVISOR_ADVISORY", subjectType: "user", subjectId: userId },
    { headers: { "Idempotency-Key": crypto.randomUUID() } },
  );
  return data;
}

export async function getAiJob(jobId: string): Promise<AiJob> {
  const { data } = await apiClient.get<AiJob>(`/ai/jobs/${jobId}`);
  return data;
}

/** Returns null while the result isn't ready yet (404), instead of throwing. */
export async function getAiResult(jobId: string): Promise<AiResult | null> {
  try {
    const { data } = await apiClient.get<AiResult>(`/ai/results/${jobId}`);
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
