"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LeaveRequestDetailModal } from "./LeaveRequestDetailModal";

function LeaveRequestDeepLinkInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestId = searchParams.get("leaveRequest");

  function close() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("leaveRequest");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return <LeaveRequestDetailModal requestId={requestId} onClose={close} />;
}

/**
 * Opens the leave request detail modal on any authenticated page when the URL
 * carries `?leaveRequest=<id>` — the target of the "View Details" link on leave
 * notifications. Renders nothing when the param is absent.
 */
export function LeaveRequestDeepLink() {
  return (
    <Suspense fallback={null}>
      <LeaveRequestDeepLinkInner />
    </Suspense>
  );
}
