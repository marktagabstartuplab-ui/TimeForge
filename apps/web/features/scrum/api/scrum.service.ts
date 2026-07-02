import { apiClient } from "@/lib/api/client";
import type { Page } from "@/features/time-tracking/api/time-entries.service";

export interface ScrumEntry {
  id: string;
  userId: string;
  entryDate: string;
  yesterday: string;
  today: string;
  blockers: string | null;
  notes: string | null;
  version: number;
}

export interface CreateScrumEntryPayload {
  entryDate: string;
  yesterday: string;
  today: string;
  blockers?: string;
  notes?: string;
}

export interface UpdateScrumEntryPayload {
  yesterday?: string;
  today?: string;
  blockers?: string;
  notes?: string;
  version: number;
}

export async function listScrumEntries(params: { from?: string; to?: string; limit?: number } = {}): Promise<Page<ScrumEntry>> {
  const { data } = await apiClient.get<Page<ScrumEntry>>("/scrum-entries", { params });
  return data;
}

export async function createScrumEntry(payload: CreateScrumEntryPayload): Promise<ScrumEntry> {
  const { data } = await apiClient.post<ScrumEntry>("/scrum-entries", payload);
  return data;
}

export async function updateScrumEntry(id: string, payload: UpdateScrumEntryPayload): Promise<ScrumEntry> {
  const { data } = await apiClient.patch<ScrumEntry>(`/scrum-entries/${id}`, payload);
  return data;
}
