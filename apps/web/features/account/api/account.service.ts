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
  departmentId: string | null;
  department: { id: string; name: string } | null;
  organization: { id: string; name: string };
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  supervisor: { id: string; firstName: string; lastName: string; email: string; avatarUrl: string | null } | null;
  roles: { role: { key: string; name: string } }[];
}

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface Session {
  id: string;
  device: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

export async function getMe(): Promise<Me> {
  const { data } = await apiClient.get<Me>("/users/me");
  return data;
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<Me> {
  const { data } = await apiClient.patch<Me>("/users/me", payload);
  return data;
}

export async function uploadAvatar(file: File): Promise<Me> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.patch<Me>("/users/me/avatar", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiClient.patch("/users/me/password", payload);
}

export async function listSessions(): Promise<Session[]> {
  const { data } = await apiClient.get<Session[]>("/users/me/sessions");
  return data;
}

/** Revokes every other active session; the current device stays signed in. */
export async function logoutOtherDevices(): Promise<void> {
  await apiClient.delete("/users/me/sessions");
}
