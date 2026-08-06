import { apiClient } from "@/lib/api/client";

export type HolidayType = "REGULAR" | "SPECIAL_NON_WORKING";

export interface Holiday {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  date: string;
  type: HolidayType;
  recurring: boolean;
  version: number;
}

export interface CreateHolidayPayload {
  name: string;
  date: string;
  type?: HolidayType;
  recurring?: boolean;
}

export async function getHolidays(): Promise<Holiday[]> {
  const { data } = await apiClient.get<Holiday[]>("/organization/holidays");
  return data;
}

export async function createHoliday(payload: CreateHolidayPayload): Promise<Holiday> {
  const { data } = await apiClient.post<Holiday>("/organization/holidays", payload);
  return data;
}

export async function removeHoliday(id: string, version: number): Promise<void> {
  await apiClient.delete(`/organization/holidays/${id}`, {
    params: { version },
  });
}
