import { useState } from "react";
import { Sparkles, Loader2, ClipboardCheck, Plus } from "lucide-react";
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

/**
 * One AI-proposed commitment. Shaped to match `CreateScrumTaskPayload`'s
 * required fields so an accepted suggestion becomes a real ScrumTask with no
 * further editing.
 */
export interface SuggestedCommitment {
  title: string;
  expectedOutput: string;
  measurement: string;
}

/** ScrumTask.title is capped server-side; keep suggestions inside it. */
const TITLE_MAX = 200;

/**
 * The model returns the suggestion array as JSON text in `recommendation`.
 * Anything malformed is dropped rather than surfaced — a half-parsed
 * suggestion would create a garbage commitment row.
 */
function parseSuggestions(raw: string | undefined): SuggestedCommitment[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
      .map((c) => ({
        title: String(c.title ?? "").trim().slice(0, TITLE_MAX),
        expectedOutput: String(c.expectedOutput ?? "").trim(),
        measurement: String(c.measurement ?? "").trim(),
      }))
      .filter((c) => c.title && c.expectedOutput && c.measurement);
  } catch {
    return [];
  }
}

interface AiScrumDraftPanelProps {
  userId: string;
  /** Today's Commitments — sent to the AI so the draft names real tasks. */
  commitments?: ScrumDraftCommitment[];
  onApply: (draft: { yesterday: string; today: string; blockers: string }) => void;
  /** Accepted suggestions — the parent persists them as ScrumTask rows. */
  onAddCommitments?: (picked: SuggestedCommitment[]) => Promise<void> | void;
  disabled?: boolean;
}

export function AiScrumDraftPanel({
  userId,
  commitments = [],
  onApply,
  onAddCommitments,
  disabled = false,
}: AiScrumDraftPanelProps) {
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<{ yesterday: string; today: string; blockers: string } | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedCommitment[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);

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
      // Suggested commitments ride along in `recommendation` on the same call,
      // so proposing tasks costs no extra latency or tokens.
      const parsed = parseSuggestions(result?.recommendation);
      setSuggestions(parsed);
      setSelected(parsed.map((_, i) => i));
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

  const toggle = (index: number) =>
    setSelected((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));

  const handleAdd = async () => {
    if (!onAddCommitments || selected.length === 0) return;
    setAdding(true);
    try {
      await onAddCommitments(selected.map((i) => suggestions[i]));
      // Accepted suggestions are now real commitment rows — drop them so the
      // same task can't be added twice from a stale panel.
      setSuggestions([]);
      setSelected([]);
    } finally {
      setAdding(false);
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
          {suggestions.length > 0 && onAddCommitments ? (
            <div className="rounded-[8px] border border-brand/20 bg-white/70 p-2.5">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-brand">
                Suggested commitments for today
              </p>
              <ul className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <li key={`${s.title}-${i}`}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-[6px] p-1.5 hover:bg-brand/5">
                      <input
                        type="checkbox"
                        checked={selected.includes(i)}
                        onChange={() => toggle(i)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#1a73e8]"
                      />
                      <span className="text-xs">
                        <span className="block font-semibold text-brand-navy">{s.title}</span>
                        <span className="block text-brand-muted">Expected: {s.expectedOutput}</span>
                        <span className="block text-brand-muted">Measure: {s.measurement}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={adding || selected.length === 0}
                  className="flex h-8 items-center gap-1.5 rounded-[8px] bg-brand px-3 text-xs font-bold text-white transition-colors hover:bg-[#1467d6] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {adding ? "Adding..." : `Add ${selected.length} as commitment${selected.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          ) : null}

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
