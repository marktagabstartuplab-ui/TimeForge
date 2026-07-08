"use client";

import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface TermsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TermsModal({ open, onOpenChange }: TermsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="terms-conditions-desc">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#c3c6d2]/30 px-6 py-5">
          <DialogTitle className="text-xl font-bold text-brand-navy">
            Terms and Conditions
          </DialogTitle>
          <DialogCloseButton className="text-brand-muted hover:bg-black/5" />
        </div>

        {/* Content */}
        <div 
          id="terms-conditions-desc" 
          className="flex-1 space-y-6 overflow-y-auto px-6 py-6 text-sm text-brand-muted"
        >
          <p className="text-xs text-brand-muted/75">Last updated: March 2026</p>

          <div className="space-y-4">
            <div>
              <h3 className="font-bold text-brand-ink text-base mb-1.5">1. Acceptance of Terms</h3>
              <p className="leading-relaxed">
                By accessing and using this platform, you agree to be bound by these Terms and Conditions.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-brand-ink text-base mb-1.5">2. Use of Service</h3>
              <p className="leading-relaxed">
                This platform is for authorized personnel only. You agree to provide accurate data, maintain confidential credentials, use the system only for legitimate business purposes, and not share sensitive data with unauthorized parties.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-brand-ink text-base mb-1.5">3. Data Accuracy</h3>
              <p className="leading-relaxed">
                Users are responsible for the accuracy of all performance metrics and updates submitted through the platform.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-brand-ink text-base mb-1.5">4. Account Security</h3>
              <p className="leading-relaxed">
                You are responsible for maintaining the security of your account. Notify your administrator immediately of any unauthorized access.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-brand-ink text-base mb-1.5">5. Intellectual Property</h3>
              <p className="leading-relaxed">
                All content, features, and functionality are owned by the company and protected by applicable intellectual property laws.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-brand-ink text-base mb-1.5">6. Limitation of Liability</h3>
              <p className="leading-relaxed">
                The platform is provided &quot;as is&quot; without warranties. We are not liable for any indirect, incidental, or consequential damages.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-brand-ink text-base mb-1.5">7. Changes to Terms</h3>
              <p className="leading-relaxed">
                We reserve the right to modify these terms at any time. Continued use constitutes acceptance of modified terms.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
