"use client";

import { User, Bell, Palette } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { useProfileModalStore } from "@/features/account/store/profile-modal.store";

export function SettingsContent() {
  const openProfileModal = useProfileModalStore((s) => s.open);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" subtitle="Manage your account and app preferences." />

      <SectionCard title="Account">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-brand-muted" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-brand-navy">Profile & Security</p>
              <p className="text-xs text-brand-muted">Name, contact info, password, and active sessions.</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => openProfileModal()}>
            Open
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Notification Preferences">
        <div className="flex items-center gap-3 pb-3">
          <Bell className="h-5 w-5 text-brand-muted" aria-hidden="true" />
          <p className="text-sm text-brand-muted">Choose which updates you get notified about.</p>
        </div>
        <EmptyState variant="comingSoon" message="Per-channel notification preferences are coming soon." />
      </SectionCard>

      <SectionCard title="Appearance">
        <div className="flex items-center gap-3 pb-3">
          <Palette className="h-5 w-5 text-brand-muted" aria-hidden="true" />
          <p className="text-sm text-brand-muted">Light, dark, and system theme options.</p>
        </div>
        <EmptyState variant="comingSoon" message="Theme switching is coming soon." />
      </SectionCard>
    </div>
  );
}
