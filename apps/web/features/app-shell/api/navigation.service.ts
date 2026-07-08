import { apiClient } from "@/lib/api/client";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface SidebarMenuItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  section: "WORKSPACE" | "MANAGEMENT" | "FINANCE_REPORTS" | "FINANCE" | "SYSTEM";
  badgeCount: number;
  permission: string;
  visible: true;
}

export interface SidebarOrganization {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface SidebarUser {
  id: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

export interface SidebarResponse {
  workspace: { name: string };
  organization: SidebarOrganization;
  user: SidebarUser;
  menu: SidebarMenuItem[];
}

// ─── API calls ──────────────────────────────────────────────────────────────────

export async function getSidebarNavigation(): Promise<SidebarResponse> {
  const { data } = await apiClient.get<SidebarResponse>("/navigation/sidebar");
  return data;
}
