import { ShieldCheck, Shield, ShieldQuestion } from "lucide-react";

// Security trust indicators shown under the login card in the Figma design.
export function TrustRow() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-4 text-brand-muted">
        <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        <Shield className="h-5 w-5" aria-hidden="true" />
        <ShieldQuestion className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-xs text-brand-muted">Enterprise-grade security &amp; 256-bit encryption</p>
    </div>
  );
}
