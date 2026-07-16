"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Back navigation for the public Support page. Uses history when the user
 * arrived from inside the app (Dashboard, Login, …); direct visits with no
 * in-app history fall back to the dashboard, whose shell redirects
 * unauthenticated users on to /login.
 */
export function SupportBackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push("/dashboard");
      }}
      className="mb-2 flex items-center gap-1.5 text-sm text-brand-muted hover:text-brand-ink"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back
    </button>
  );
}
