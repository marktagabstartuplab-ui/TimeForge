import type { Metadata } from "next";
import { Mail, MessageCircle, BookOpen } from "lucide-react";
import { AppShell } from "@/features/app-shell/components/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Support | TimeForge" };

export default function SupportPage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <PageHeader title="Support" subtitle="Get help with your TimeForge account." />

        <SectionCard title="Contact Us">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-brand-muted" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-brand-navy">Email Support</p>
                <p className="text-xs text-brand-muted">We typically reply within one business day.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" nativeButton={false} render={<a href="mailto:support@timeforge.com" />}>
              support@timeforge.com
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="More Ways to Get Help">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-brand-muted" aria-hidden="true" />
            <p className="text-sm text-brand-muted">
              For account or organization administration questions, reach out to your team&apos;s administrator or HR contact.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-brand-muted" aria-hidden="true" />
            <p className="text-sm text-brand-muted">
              Check the Help icon in the top bar for quick tips while you work.
            </p>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
