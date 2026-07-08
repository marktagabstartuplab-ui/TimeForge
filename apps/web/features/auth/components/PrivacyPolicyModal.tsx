"use client";

import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface PrivacyPolicyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrivacyPolicyModal({ open, onOpenChange }: PrivacyPolicyModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="privacy-policy-desc">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#c3c6d2]/30 px-6 py-5">
          <DialogTitle className="text-xl font-bold text-brand-navy">
            Privacy Policy
          </DialogTitle>
          <DialogCloseButton className="text-brand-muted hover:bg-black/5" />
        </div>

        {/* Content */}
        <div 
          id="privacy-policy-desc" 
          className="flex-1 space-y-6 overflow-y-auto px-6 py-6 text-sm text-brand-muted"
        >
          <p className="text-xs text-brand-muted/75">Last updated: March 2026</p>

          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-brand-ink text-base mb-1.5">1. Information We Collect</h3>
              <p className="leading-relaxed">
                We collect account information (name, email, role), performance metrics and KPI data, daily and weekly update submissions, and system usage and activity logs.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-brand-ink text-base mb-1.5">2. How We Use Your Information</h3>
              <p className="leading-relaxed">
                Your data is used to track and analyze performance, generate reports, provide recommendations, and facilitate team collaboration.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-brand-ink text-base mb-1.5">3. Data Security</h3>
              <p className="leading-relaxed">
                We implement encrypted data transmission (SSL/TLS), secure database storage, role-based access control, and regular security audits.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-brand-ink text-base mb-1.5">4. Data Access</h3>
              <p className="leading-relaxed">
                Your data is accessible to you, your direct supervisors, system administrators, and authorized HR personnel.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-brand-ink text-base mb-1.5">5. Data Retention</h3>
              <p className="leading-relaxed">
                We retain your data for as long as your account is active and as required by company policy and applicable laws.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-brand-ink text-base mb-1.5">6. Your Rights</h3>
              <p className="leading-relaxed">
                You have the right to access your data, request corrections, export your history, and contact administrators with privacy concerns.
              </p>
            </div>
          </div>

          {/* Contact Alert Box */}
          <div className="rounded-modal text-body border border-blue-100 bg-[#f0f9ff] p-4 text-[#0369a1]">
            <p>
              For privacy questions, contact your administrator or email{" "}
              <a 
                href="mailto:privacy@startuplab.com" 
                className="font-semibold text-[#0284c7] hover:underline"
              >
                privacy@startuplab.com
              </a>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
