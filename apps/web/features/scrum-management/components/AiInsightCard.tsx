"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { triggerSupervisorAdvisory, getAiJob, getAiResult } from "../api/ai-insight.service";

export function AiInsightCard({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);

  const trigger = useMutation({
    mutationFn: () => triggerSupervisorAdvisory(userId),
    onSuccess: (res) => setJobId(res.jobId),
  });

  const { data: job } = useQuery({
    queryKey: ["ai-job", jobId],
    queryFn: () => getAiJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "SUCCEEDED" || status === "FAILED" ? false : 2000;
    },
  });

  const { data: result } = useQuery({
    queryKey: ["ai-result", jobId],
    queryFn: () => getAiResult(jobId!),
    enabled: !!jobId && job?.status === "SUCCEEDED",
  });

  const isWorking = job ? job.status === "QUEUED" || job.status === "RUNNING" : trigger.isPending;

  return (
    <SectionCard
      title="AI Insights"
      className="bg-brand text-white [&_h3]:text-white"
    >
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/70">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Team Health Advisory
      </div>

      {!jobId ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-white/80">
            Generate a real AI advisory over your team&apos;s recent timesheets and scrum blockers.
          </p>
          <Button
            type="button"
            onClick={() => {
              queryClient.removeQueries({ queryKey: ["ai-job"] });
              trigger.mutate();
            }}
            disabled={trigger.isPending}
            className="w-fit bg-white text-brand hover:bg-white/90"
          >
            {trigger.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            Generate Insight
          </Button>
          {trigger.isError ? (
            <p className="text-sm text-red-200">
              {trigger.error instanceof ApiError ? trigger.error.message : "Couldn't start the AI job."}
            </p>
          ) : null}
        </div>
      ) : isWorking ? (
        <div className="flex items-center gap-2 text-sm text-white/80">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Analyzing team activity…
        </div>
      ) : job?.status === "FAILED" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-red-200">Insight generation failed{job.errorMsg ? `: ${job.errorMsg}` : "."}</p>
          <Button type="button" size="sm" onClick={() => { setJobId(null); }} className="w-fit bg-white text-brand hover:bg-white/90">
            Try Again
          </Button>
        </div>
      ) : result ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-white">{result.summary}</p>
          <div className="border-t border-white/20 pt-3">
            <p className="text-xs font-bold uppercase tracking-wide text-white/70">Recommendation</p>
            <p className="mt-1 text-sm text-white">{result.recommendation}</p>
          </div>
          <p className="text-xs text-white/60">Confidence: {Math.round(result.confidence * 100)}%</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-white/80">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading result…
        </div>
      )}
    </SectionCard>
  );
}
