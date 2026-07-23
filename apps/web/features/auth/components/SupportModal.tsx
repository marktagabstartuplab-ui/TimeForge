"use client";

import { Mail, MessageCircle, BookOpen } from "lucide-react";
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { BRAND_NAME } from "@/lib/constants";

interface SupportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportModal({ open, onOpenChange }: SupportModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="support-desc">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#c3c6d2]/30 px-6 py-5">
          <DialogTitle className="text-xl font-bold text-brand-navy">
            Support
          </DialogTitle>
          <DialogCloseButton className="text-brand-muted hover:bg-black/5" />
        </div>

        {/* Content */}
        <div
          id="support-desc"
          className="flex-1 space-y-6 overflow-y-auto px-6 py-6 text-sm text-brand-muted"
        >
          <p>Get help with your {BRAND_NAME} account.</p>

          <div className="rounded-modal border border-[#c3c6d2]/40 p-4">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brand-muted" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-brand-ink">Email Support</p>
                <p className="mt-0.5 text-xs text-brand-muted">
                  We typically reply within one business day.
                </p>
                <a
                  href="mailto:support@timeforge.com"
                  className="mt-2 inline-block font-semibold text-brand hover:underline"
                >
                  support@timeforge.com
                </a>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-muted" aria-hidden="true" />
              <p className="leading-relaxed">
                For account or organization administration questions, reach out to your team&apos;s
                administrator or HR contact.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-brand-muted" aria-hidden="true" />
              <p className="leading-relaxed">
                Once signed in, check the Help icon in the top bar for quick tips while you work.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
