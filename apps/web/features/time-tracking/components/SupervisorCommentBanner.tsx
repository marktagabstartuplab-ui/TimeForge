import Link from "next/link";
import { MessageSquareText } from "lucide-react";

function formatEntryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Read-only supervisor feedback block shown to the employee. Single source of
 * truth for the "Supervisor Comment" banner: rendered inside ScrumTaskCard for
 * the currently open entry, and standalone at the top of the Daily Scrum page
 * to surface feedback left on a *recent* entry — so it displays regardless of
 * whether the employee arrived via the sidebar or a notification deep link.
 *
 * Pass `entryDate` + `viewHref` for the standalone variant (labels the day and
 * links to that entry's full scrum via ?scrum=<id>); omit both when the
 * surrounding card already shows the entry it belongs to.
 */
export function SupervisorCommentBanner({
  note,
  entryDate,
  viewHref,
}: {
  note: string;
  entryDate?: string;
  viewHref?: string;
}) {
  return (
    <div className="rounded-[12px] border border-brand/30 bg-brand/5 p-4">
      <div className="flex items-start gap-2.5">
        <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.5px] text-brand">
              Supervisor Comment{entryDate ? ` · ${formatEntryDate(entryDate)}` : ""}
            </p>
            {viewHref ? (
              <Link href={viewHref} className="shrink-0 text-xs font-semibold text-brand hover:underline">
                View that scrum
              </Link>
            ) : null}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-brand-ink">{note}</p>
        </div>
      </div>
    </div>
  );
}
