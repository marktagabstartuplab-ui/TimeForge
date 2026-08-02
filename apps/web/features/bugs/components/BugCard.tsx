"use client";

import Link from "next/link";
import { MessageSquare, Paperclip, MapPin } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { BugPriorityBadge, BugSeverityBadge, BugStatusBadge } from "./StatusBadge";
import type { Bug } from "../api/bugs.service";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function BugCard({ bug }: { bug: Bug }) {
  return (
    <Link
      href={`/bugs/${bug.id}`}
      className="flex flex-col gap-3 rounded-[12px] border border-[#c3c6d2]/60 bg-white p-4 transition-colors hover:border-brand"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-brand-ink">{bug.title}</h3>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <BugStatusBadge status={bug.status} />
          <BugPriorityBadge priority={bug.priority} />
          <BugSeverityBadge severity={bug.severity} />
        </div>
      </div>

      <p className="line-clamp-2 text-[13px] text-brand-muted">{bug.issue}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-brand-muted">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {bug.whereItHappens}
        </span>
        {bug._count ? (
          <>
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              {bug._count.comments}
            </span>
            <span className="inline-flex items-center gap-1">
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
              {bug._count.attachments}
            </span>
          </>
        ) : null}
        <span className="ml-auto">{formatDate(bug.createdAt)}</span>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#c3c6d2]/30 pt-3">
        <div className="flex items-center gap-2">
          {bug.reporter ? (
            <>
              <Avatar firstName={bug.reporter.firstName} lastName={bug.reporter.lastName} size="sm" />
              <span className="text-xs text-brand-muted">
                {bug.reporter.firstName} {bug.reporter.lastName}
              </span>
            </>
          ) : null}
        </div>
        <span className="text-xs text-brand-muted">
          {bug.assignee ? `Assigned to ${bug.assignee.firstName} ${bug.assignee.lastName}` : "Unassigned"}
        </span>
      </div>
    </Link>
  );
}
