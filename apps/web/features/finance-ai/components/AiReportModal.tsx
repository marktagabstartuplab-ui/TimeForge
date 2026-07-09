"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Clock, Sparkles, XCircle } from "lucide-react";
import type { AiReportResult } from "../api/finance-ai.service";

interface AiReportModalProps {
  open: boolean;
  onClose: () => void;
  report: AiReportResult | null;
  isLoading?: boolean;
}

const featureLabels: Record<string, string> = {
  FINANCE_REPORT: "Finance AI Report",
  GENERAL: "Finance AI Report",
};

const featureIcons: Record<string, React.FC<{ className?: string }>> = {
  FINANCE_REPORT: FileText,
  GENERAL: FileText,
};

export function AiReportModal({ open, onClose, report, isLoading }: AiReportModalProps) {
  const FeatureIcon = report ? (featureIcons[report.feature] ?? FileText) : FileText;
  const featureLabel = report ? (featureLabels[report.feature] ?? "AI Report") : "AI Report";

  let parsedSummary: Record<string, unknown> | null = null;
  let parsedRecommendation = "";
  if (report?.result?.summary) {
    try {
      parsedSummary = JSON.parse(report.result.summary);
    } catch { /* ignore */ }
  }
  if (report?.result?.recommendation) {
    parsedRecommendation = report.result.recommendation;
  }

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[min(800px,calc(100vw-2rem))]">
        <div className="flex items-center justify-between border-b border-[#c3c6d2]/30 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand/10">
              <FeatureIcon className="h-5 w-5 text-brand" />
            </div>
            <div>
              <DialogTitle className="text-lg">{featureLabel}</DialogTitle>
              <DialogDescription className="text-xs">
                {report ? `Generated ${new Date(report.createdAt).toLocaleString()}` : "Generating..."}
              </DialogDescription>
            </div>
          </div>
          <DialogCloseButton />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading || !report ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-brand" />
              <p className="text-sm text-brand-muted">Generating AI report. This may take a moment...</p>
            </div>
          ) : report.status === "FAILED" ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <XCircle className="h-10 w-10 text-red-500" />
              <p className="text-sm font-medium text-red-600">Report generation failed</p>
              {report.errorMsg && <p className="text-xs text-brand-muted max-w-md text-center">{report.errorMsg}</p>}
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            </div>
          ) : report.status === "SUCCEEDED" && report.result ? (
            <div className="flex flex-col gap-5">
              {/* Confidence Badge */}
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand" />
                <span className="text-xs text-brand-muted">
                  AI Confidence: <strong className="text-brand-navy">{Math.round(report.result.confidence * 100)}%</strong>
                </span>
                {report.latencyMs != null && (
                  <span className="text-xs text-brand-muted ml-2">
                    Processed in {(report.latencyMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>

              {/* Summary Cards */}
              {parsedSummary && (
                <div>
                  <h4 className="text-sm font-bold text-brand-navy mb-3">Executive Summary</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(parsedSummary).map(([key, value]) => (
                      <div key={key} className="rounded-[10px] border border-[#c3c6d2]/30 bg-[#f6f3f4] p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-muted mb-1">
                          {key.replace(/([A-Z])/g, " $1").trim()}
                        </p>
                        <p className="text-lg font-bold text-brand-navy">
                          {typeof value === "number" ? `₱${(value / 1000).toFixed(1)}K` : String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendation */}
              {parsedRecommendation && (
                <div>
                  <h4 className="text-sm font-bold text-brand-navy mb-2">AI Recommendation</h4>
                  <div className="rounded-[10px] border border-amber-200 bg-amber-50 p-3 text-sm text-brand-navy leading-relaxed">
                    {parsedRecommendation}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Clock className="h-8 w-8 text-amber-500" />
              <p className="text-sm text-brand-muted">Report is still being processed...</p>
              <Loader2 className="h-5 w-5 animate-spin text-brand" />
            </div>
          )}
        </div>

        {report?.status === "SUCCEEDED" && (
          <div className="flex items-center justify-end gap-2 border-t border-[#c3c6d2]/30 px-6 py-4 shrink-0">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
