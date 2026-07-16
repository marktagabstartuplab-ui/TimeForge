"use client";

import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  Palette,
  ScrollText,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { useProfileModalStore } from "@/features/account/store/profile-modal.store";

/** Icon chip matching the dashboard's MetricCard icon treatment. */
function IconChip({ icon: Icon }: { icon: typeof User }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-cyan/15 text-brand">
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </span>
  );
}

/** One settings row: icon chip, label + description, action on the right. */
function SettingsRow({
  icon,
  label,
  description,
  action,
}: {
  icon: typeof User;
  label: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <IconChip icon={icon} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-navy">{label}</p>
          <p className="text-xs text-brand-muted">{description}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/**
 * Settings — card-based layout matching the rest of the dashboard: a
 * responsive grid of SectionCards grouped by concern. Everything here reuses
 * existing surfaces (the Profile & Account modal owns account + security;
 * the admin pages own organization/AI/system settings) — this page only
 * organizes the entry points, so no functionality or RBAC changes.
 * Admin-scoped cards mirror the sidebar's visibility (SYSTEM/management
 * areas are admin-only there too).
 */
export function SettingsContent() {
  const router = useRouter();
  const { user } = useAuth();
  const openProfileModal = useProfileModalStore((s) => s.open);
  const isAdmin = user?.roles.includes("ADMIN") ?? false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" subtitle="Manage your account and app preferences." />

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        <SectionCard title="Account">
          <SettingsRow
            icon={User}
            label="Profile & Account"
            description="Name, contact info, department, and avatar."
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => openProfileModal()}>
                Open
              </Button>
            }
          />
        </SectionCard>

        <SectionCard title="Security">
          <SettingsRow
            icon={ShieldCheck}
            label="Password & Sessions"
            description="Change your password and sign out other devices."
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => openProfileModal()}>
                Manage
              </Button>
            }
          />
        </SectionCard>

        <SectionCard title="Notifications">
          <div className="flex items-center gap-3 pb-3">
            <IconChip icon={Bell} />
            <p className="text-sm text-brand-muted">Choose which updates you get notified about.</p>
          </div>
          <EmptyState variant="comingSoon" message="Per-channel notification preferences are coming soon." />
        </SectionCard>

        <SectionCard title="Appearance">
          <div className="flex items-center gap-3 pb-3">
            <IconChip icon={Palette} />
            <p className="text-sm text-brand-muted">Light, dark, and system theme options.</p>
          </div>
          <EmptyState variant="comingSoon" message="Theme switching is coming soon." />
        </SectionCard>

        {isAdmin ? (
          <>
            <SectionCard title="Organization">
              <SettingsRow
                icon={Building2}
                label="Departments & Projects"
                description="Manage the org structure, department heads, and projects."
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => router.push("/admin/departments")}>
                    Open
                  </Button>
                }
              />
            </SectionCard>

            <SectionCard title="AI">
              <SettingsRow
                icon={Sparkles}
                label="AI Settings"
                description="Enable or disable AI features per module."
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => router.push("/admin/ai-config")}>
                    Configure
                  </Button>
                }
              />
            </SectionCard>

            <SectionCard title="System">
              <SettingsRow
                icon={ScrollText}
                label="System Logs"
                description="Security events and the audit trail."
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => router.push("/admin/security")}>
                    View
                  </Button>
                }
              />
            </SectionCard>
          </>
        ) : null}
      </div>
    </div>
  );
}
