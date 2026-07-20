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

export async function triggerAiJob(
  feature: string,
  subjectType: string,
  subjectId: string,
  options?: Record<string, unknown>
): Promise<{ jobId: string; status: AiJobStatus }> {
  const { data } = await apiClient.post<{ jobId: string; status: AiJobStatus }>(
    "/ai/jobs",
    { feature, subjectType, subjectId, options },
    { headers: { "Idempotency-Key": crypto.randomUUID() } },
  );
  return data;
}

export async function runAndPollAiJob(
  feature: string,
  subjectType: string,
  subjectId: string,
  options?: Record<string, unknown>
): Promise<AiResult> {
  const { jobId } = await triggerAiJob(feature, subjectType, subjectId, options);

  // The worker's model call alone can take up to 60s (AbortSignal.timeout in
  // openai.provider.ts), plus queue wait and one BullMQ retry — the old 30s
  // window (20 × 1.5s) made every non-trivial feature "time out" while its
  // job was still legitimately running. 60 × 2s = 120s covers a full call
  // plus a retry; FAILED still short-circuits immediately.
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const job = await getAiJob(jobId);
    if (job.status === "SUCCEEDED") {
      const res = await getAiResult(jobId);
      if (res) return res;
    }
    if (job.status === "FAILED") {
      throw new Error(job.errorMsg || "AI job failed execution");
    }
  }
  throw new Error("AI analysis timed out. Please try again.");
}
