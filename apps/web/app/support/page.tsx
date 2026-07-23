import type { Metadata } from "next";
import { Mail, MessageCircle, BookOpen } from "lucide-react";
import { AuthTopBar } from "@/features/auth/components/AuthTopBar";
import { AuthFooter } from "@/features/auth/components/AuthFooter";
import { SupportBackButton } from "@/features/auth/components/SupportBackButton";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { BRAND_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: `Support | ${BRAND_NAME}` };

/**
 * Public support page — reachable from the Login/Register pages before
 * authentication, so it must not sit behind AppShell's auth guard. Uses the
 * same header/footer chrome as the other public auth pages instead.
 */
export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f2f2f2]">
      <AuthTopBar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6">
          <div>
            <SupportBackButton />
            <PageHeader title="Support" subtitle={`Get help with your ${BRAND_NAME} account.`} />
          </div>

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
      </main>
      <AuthFooter />
    </div>
  );
}
