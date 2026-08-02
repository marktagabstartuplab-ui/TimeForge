"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Avatar } from "@/components/shared/Avatar";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { addBugComment, type BugComment } from "../api/bugs.service";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface CommentThreadProps {
  bugId: string;
  comments: BugComment[];
  canComment: boolean;
}

export function CommentThread({ bugId, comments, canComment }: CommentThreadProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => addBugComment(bugId, draft.trim()),
    onSuccess: () => {
      setDraft("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["bugs", bugId] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Failed to post the comment.");
    },
  });

  return (
    <SectionCard title={`Comments (${comments.length})`}>
      <div className="flex flex-col gap-4 p-4">
        {comments.length === 0 ? (
          <EmptyState variant="empty" message="No comments yet." />
        ) : (
          <ul className="flex flex-col gap-4">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-3">
                <Avatar
                  firstName={c.user?.firstName ?? "?"}
                  lastName={c.user?.lastName ?? ""}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-semibold text-brand-ink">
                      {c.user ? `${c.user.firstName} ${c.user.lastName}` : "Unknown user"}
                    </span>
                    <span className="text-xs text-brand-muted">{formatDateTime(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] text-brand-ink">{c.comment}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {canComment ? (
          <div className="flex flex-col gap-2 border-t border-[#c3c6d2]/30 pt-4">
            <Textarea
              aria-label="Add a comment"
              rows={3}
              placeholder="Add a comment…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={!draft.trim() || mutation.isPending}
                className="rounded-[10px] bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-[#1467d6] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {mutation.isPending ? "Posting…" : "Post Comment"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
