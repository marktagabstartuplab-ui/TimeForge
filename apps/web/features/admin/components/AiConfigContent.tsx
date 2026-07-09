"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, RefreshCw, Save, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { getAiConfig, updateAiToggles } from "../api/admin-ai.service";

const ALL_FEATURES = [
  "DAILY_SUMMARY",
  "WEEKLY_SUMMARY",
  "TIMESHEET_SUMMARY",
  "BLOCKER_DETECTION",
  "PRODUCTIVITY_INSIGHT",
  "SUPERVISOR_ADVISORY",
  "KPI_ANALYSIS",
  "PAYROLL_VALIDATION",
] as const;

const FEATURE_LABELS: Record<string, string> = {
  DAILY_SUMMARY: "Daily Summary",
  WEEKLY_SUMMARY: "Weekly Summary",
  TIMESHEET_SUMMARY: "Timesheet Summary",
  BLOCKER_DETECTION: "Blocker Detection",
  PRODUCTIVITY_INSIGHT: "Productivity Insight",
  SUPERVISOR_ADVISORY: "Supervisor Advisory",
  KPI_ANALYSIS: "KPI Analysis",
  PAYROLL_VALIDATION: "Payroll Validation",
};

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  DAILY_SUMMARY: "Generates AI-powered daily work summaries for each user.",
  WEEKLY_SUMMARY: "Generates AI-powered weekly performance summaries.",
  TIMESHEET_SUMMARY: "Generates natural language timesheet descriptions.",
  BLOCKER_DETECTION: "Detects and flags potential blockers from scrum entries.",
  PRODUCTIVITY_INSIGHT: "Provides AI-driven productivity analysis for teams.",
  SUPERVISOR_ADVISORY: "Generates advisory insights for supervisors.",
  KPI_ANALYSIS: "Analyzes KPI progress and generates recommendations.",
  PAYROLL_VALIDATION: "Validates payroll entries using AI anomaly detection.",
};

export function AiConfigContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  const { data: config, isLoading, refetch } = useQuery({
    queryKey: ["admin", "ai-config"],
    queryFn: getAiConfig,
  });

  useEffect(() => {
    if (config?.["ai.toggles"]?.value) {
      setToggles(config["ai.toggles"].value as Record<string, boolean>);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: updateAiToggles,
    onSuccess: () => {
      setToast({ message: "AI configuration saved successfully.", tone: "success" });
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "ai-config"] });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Failed to save AI configuration.", tone: "error" });
    },
  });

  const handleToggle = (feature: string) => {
    setToggles((prev) => ({ ...prev, [feature]: !prev[feature] }));
    setDirty(true);
  };

  const provider = (config?.["ai.provider"]?.value as string) ?? "stub";
  const model = (config?.["ai.model"]?.value as string) ?? "qwen/qwen3.6-plus";
  const tokenBudget = (config?.["ai.token_budget"]?.value as number) ?? 100000;
  const isLive = provider !== "stub";
  const enabledCount = Object.values(toggles).filter(Boolean).length;
  const totalCount = ALL_FEATURES.length;

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-brand-navy">AI Configuration</h1>
        <p className="text-sm text-brand-muted">
          Manage AI provider settings and enable or disable individual AI features.
        </p>
      </div>

      {/* Provider Status Card */}
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isLive ? "bg-[#f0fdf4]" : "bg-amber-50"}`}>
              <Sparkles className={`h-5 w-5 ${isLive ? "text-[#15803d]" : "text-amber-600"}`} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand-navy">Provider: {provider}</h2>
              <p className="text-xs text-brand-muted">
                {isLive
                  ? `Live connection — ${model} (token budget: ${tokenBudget.toLocaleString()})`
                  : "Running in stub mode — responses are simulated"}
              </p>
            </div>
          </div>
          <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
            isLive ? "bg-[#f0fdf4] text-[#15803d]" : "bg-amber-50 text-amber-700"
          }`}>
            {isLive ? "Live" : "Stub"}
          </span>
        </div>
      </div>

      {/* Feature Toggles */}
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-brand-navy">Feature Toggles</h2>
            <p className="text-xs text-brand-muted mt-1">
              {enabledCount} of {totalCount} features enabled
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="h-8 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => saveMutation.mutate(toggles)}
              disabled={!dirty || saveMutation.isPending}
              className="h-8 text-xs bg-[#0052cc] hover:bg-[#004bb3]"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ALL_FEATURES.map((feature) => (
              <div
                key={feature}
                className="flex items-start justify-between p-4 rounded-xl border border-[#c3c6d2]/30 hover:border-[#c3c6d2]/60 transition-colors"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-brand-navy">
                    {FEATURE_LABELS[feature]}
                  </span>
                  <span className="text-xs text-brand-muted leading-relaxed pr-4">
                    {FEATURE_DESCRIPTIONS[feature]}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={toggles[feature] ?? true}
                    onChange={() => handleToggle(feature)}
                  />
                  <div className="w-10 h-5.5 bg-gray-200 rounded-full peer peer-checked:bg-[#0052cc] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#0052cc]/30 transition-colors after:content-[''] after:absolute after:top-0.5 after:start-[3px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-all peer-checked:after:translate-x-[18px]" />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage note */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200/60 bg-amber-50/50 p-4">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 leading-relaxed">
          Disabling a feature prevents all users from triggering AI jobs for that feature.
          Existing generated results remain visible unless manually deleted.
          Changes take effect immediately.
        </p>
      </div>
    </div>
  );
}
