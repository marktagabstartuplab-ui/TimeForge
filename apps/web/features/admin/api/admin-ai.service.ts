import { apiClient } from "@/lib/api/client";

export interface AiConfigResponse {
  [key: string]: { value: unknown; type: string };
}

export async function getAiConfig(): Promise<AiConfigResponse> {
  const { data } = await apiClient.get<AiConfigResponse>("/admin/ai-config");
  return data;
}

export async function updateAiToggles(toggles: Record<string, boolean>): Promise<void> {
  await apiClient.put("/admin/ai-config/toggles", toggles);
}
