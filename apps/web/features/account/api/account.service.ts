import { apiClient } from "@/lib/api/client";

export interface Me {
  id: string;
  email: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  phone: string | null;
  status: string;
  employmentType: string;
  roles: { role: { key: string; name: string } }[];
}

export async function getMe(): Promise<Me> {
  const { data } = await apiClient.get<Me>("/users/me");
  return data;
}
