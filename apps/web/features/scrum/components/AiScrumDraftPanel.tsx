import { useState } from "react";
import { Sparkles, Loader2, ClipboardCheck } from "lucide-react";
import { runAndPollAiJob } from "@/features/scrum-management/api/ai-insight.service";

/**
 * The subset of a planned commitment the draft prompt consumes (BUG-AK).
 * Deliberately a plain shape rather than `ScrumTask` — this is a wire payload,
 * and the worker reads exactly these keys.
 */
export interface ScrumDraftCommitment {
  title: string;
  status: string;
  expectedOutput?: string;
  measurement?: string;
  kpi?: string;
  plannedTarget?: string;
  actualCompleted?: string;
  projectName?: string;
}

interface AiScrumDraftPanelProps {
  userId: string;
  /** Today's Commitments — sent to the AI so the draft names real tasks. */
  commitments?: ScrumDraftCommitment[];
  onApply: (draft: { yesterday: string; today: string; blockers: string }) => void;
  disabled?: boolean;
}

export function AiScrumDraftPanel({ userId, commitments = [], onApply, disabled = false }: AiScrumDraftPanelProps) {
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<{ yesterday: string; today: string; blockers: string } | null>(null);

  const handleCompose = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await runAndPollAiJob("STANDUP_DRAFT", "user", userId, { commitments });
      if (result?.summary) {
        // Parse "Yesterday", "Today", and "Blockers" from LLM output
        const text = result.summary;
        const yesterdayMatch = text.match(/Yesterday:?\s*([\s\S]*?)(?=Today:?|Blockers:?|$)/i);
        const todayMatch = text.match(/Today:?\s*([\s\S]*?)(?=Blockers:?|Yesterday:?|$)/i);
        const blockersMatch = text.match(/Blockers:?\s*([\s\S]*?)(?=Yesterday:?|Today:?|$)/i);

        setDraft({
          yesterday: yesterdayMatch?.[1]?.trim() || "No yesterday activities identified.",
          today: todayMatch?.[1]?.trim() || "No today activities identified.",
          blockers: blockersMatch?.[1]?.trim() || "No blockers identified.",
        });
      }
    } catch (error) {
      console.error("AI Daily Standup generation failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (draft) {
      onApply(draft);
    }
  };

  return (
    <div className="rounded-[12px] border border-brand/20 bg-gradient-to-r from-brand/5 to-brand-cyan/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-[0.5px] text-brand">✨ AI Daily Standup Composer</h4>
          <p className="text-[11px] text-brand-muted mt-0.5">Let AI analyze today&apos;s tasks and draft your Daily Scrum report.</p>
        </div>
        <button
          type="button"
          onClick={handleCompose}
          disabled={loading || disabled}
          className="flex h-8 items-center gap-1.5 rounded-[8px] bg-brand px-3 text-xs font-bold text-white hover:bg-[#1467d6] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {loading ? "Drafting..." : "Draft Scrum"}
        </button>
      </div>

      {draft && (
        <div className="space-y-3 pt-2 border-t border-brand/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="rounded-[8px] bg-white border border-[#c3c6d2]/30 p-2.5">
              <span className="font-bold text-brand-navy block mb-1">Yesterday:</span>
              <p className="text-brand-ink whitespace-pre-wrap">{draft.yesterday}</p>
            </div>
            <div className="rounded-[8px] bg-white border border-[#c3c6d2]/30 p-2.5">
              <span className="font-bold text-brand-navy block mb-1">Today:</span>
              <p className="text-brand-ink whitespace-pre-wrap">{draft.today}</p>
            </div>
            <div className="rounded-[8px] bg-white border border-[#c3c6d2]/30 p-2.5">
              <span className="font-bold text-brand-navy block mb-1">Blockers:</span>
              <p className="text-brand-ink whitespace-pre-wrap">{draft.blockers}</p>
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleApply}
              className="flex h-8 items-center gap-1.5 rounded-[8px] border border-brand bg-white px-3 text-xs font-bold text-brand hover:bg-brand/5 transition-colors"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Apply Draft to Form
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
