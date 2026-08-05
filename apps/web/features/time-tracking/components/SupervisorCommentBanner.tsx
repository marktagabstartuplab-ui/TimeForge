import Link from "next/link";
import { MessageSquareText, X } from "lucide-react";

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
 *
 * Pass `onDismiss` to offer the employee a way to clear the banner once they've
 * read it (BUG-AR) — the comment stays on the entry and remains visible in Daily
 * Scrum History, it just stops occupying the active workspace.
 */
export function SupervisorCommentBanner({
  note,
  entryDate,
  viewHref,
  onDismiss,
  dismissing = false,
}: {
  note: string;
  entryDate?: string;
  viewHref?: string;
  onDismiss?: () => void;
  dismissing?: boolean;
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
            <span className="flex shrink-0 items-center gap-2">
              {viewHref ? (
                <Link href={viewHref} className="text-xs font-semibold text-brand hover:underline">
                  View that scrum
                </Link>
              ) : null}
              {onDismiss ? (
                <button
                  type="button"
                  onClick={onDismiss}
                  disabled={dismissing}
                  aria-label="Dismiss supervisor comment"
                  title="Dismiss — stays visible in Daily Scrum History"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-brand-muted transition-colors hover:bg-brand/10 hover:text-brand disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-brand-ink">{note}</p>
        </div>
      </div>
    </div>
  );
}
