import { apiClient } from "@/lib/api/client";

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
  organizationId: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
}

export interface Department {
  id: string;
  name: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  jobTitle: string;
  departmentId: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>("/auth/login", { email, password });
  return data;
}

export async function register(payload: RegisterPayload): Promise<{ status: string }> {
  const { data } = await apiClient.post<{ status: string }>("/auth/register", payload);
  return data;
}

export async function forgotPassword(email: string): Promise<{ status: string }> {
  const { data } = await apiClient.post<{ status: string }>("/auth/forgot-password", { email });
  return data;
}

export async function resetPassword(token: string, password: string): Promise<{ status: string }> {
  const { data } = await apiClient.post<{ status: string }>("/auth/reset-password", { token, password });
  return data;
}

export async function fetchDepartments(): Promise<Department[]> {
  const { data } = await apiClient.get<Department[]>("/auth/departments");
  return data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout");
}
