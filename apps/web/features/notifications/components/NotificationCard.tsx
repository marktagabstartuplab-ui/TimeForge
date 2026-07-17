"use client";

import { Bell, Archive, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { AppNotification } from "../api/notifications.service";
import { CATEGORY_ICONS, CATEGORY_LABELS, formatRelativeTime } from "../lib/notification-copy";

interface NotificationCardProps {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}

export function NotificationCard({ notification: n, onMarkRead, onArchive, onDelete }: NotificationCardProps) {
  const Icon = CATEGORY_ICONS[n.category] ?? Bell;

  return (
    <li
      className={
        n.isRead
          ? "flex items-start gap-3 border-l-4 border-transparent px-4 py-3.5"
          : "flex items-start gap-3 border-l-4 border-brand bg-brand-cyan/5 px-4 py-3.5"
      }
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-navy/10 text-brand-navy">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-brand-navy">{n.title}</p>
          <div className="flex shrink-0 items-center gap-2">
            {n.priority === "HIGH" ? <StatusBadge label="PRIORITY" tone="danger" /> : null}
            {!n.isRead ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
          </div>
        </div>
        <p className="mt-0.5 text-sm text-brand-muted">{n.message}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-muted">
          <span>{formatRelativeTime(n.createdAt)}</span>
          <span className="text-brand-muted/60">{CATEGORY_LABELS[n.category]}</span>
          {n.actionUrl && n.actionLabel ? (
            <a
              href={n.actionUrl}
              onClick={() => !n.isRead && onMarkRead(n.id)}
              className="font-semibold text-brand hover:underline"
            >
              {n.actionLabel}
            </a>
          ) : null}
          {!n.isRead ? (
            <button type="button" onClick={() => onMarkRead(n.id)} className="font-medium text-brand-muted hover:text-brand-navy">
              Mark read
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onArchive(n.id)}
            className="flex items-center gap-1 font-medium text-brand-muted hover:text-brand-navy"
          >
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
            {n.isArchived ? "Unarchive" : "Archive"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(n.id)}
            aria-label="Delete notification"
            className="flex items-center gap-1 font-medium text-brand-muted hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}
