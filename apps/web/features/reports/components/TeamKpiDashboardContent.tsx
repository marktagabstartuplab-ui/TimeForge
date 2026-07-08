"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  MessageSquare,
  Users,
  CheckCircle,
  HelpCircle
} from "lucide-react";
import { getTeamKpiSummary, getTeamKpiChart, getUnderperformingMembers, submitCoachingRemarks } from "../api/kpi.service";
import { SectionCard } from "@/components/shared/SectionCard";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { Avatar } from "@/components/shared/Avatar";
import { Button } from "@/components/ui/button";

const TARGET_REACHED_THRESHOLD = 75;

function splitName(fullName: string): { firstName: string; lastName: string } {
  const [firstName = "", ...rest] = fullName.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

function formatJoinedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function TeamKpiDashboardContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [quarter, setQuarter] = useState("This Quarter");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [coachingRemarks, setCoachingRemarks] = useState("");
  const [isCoachingModalOpen, setIsCoachingModalOpen] = useState(false);

  // Queries
  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["team-kpi-summary", quarter],
    queryFn: () => getTeamKpiSummary({ quarter }),
  });

  const { data: chartData = [], isLoading: isChartLoading } = useQuery({
    queryKey: ["team-kpi-chart", quarter],
    queryFn: () => getTeamKpiChart({ quarter }),
  });

  const { data: underperforming = [], isLoading: isUnderperformingLoading } = useQuery({
    queryKey: ["team-kpi-underperforming", quarter],
    queryFn: () => getUnderperformingMembers({ quarter }),
  });

  // Coaching Mutation
  const coachingMutation = useMutation({
    mutationFn: (payload: { userId: string; remarks: string }) => submitCoachingRemarks(payload),
    onSuccess: () => {
      setToast({ message: "Coaching remarks saved and AI recommendations updated.", tone: "success" });
      setIsCoachingModalOpen(false);
      setCoachingRemarks("");
      setSelectedUserId(null);
      queryClient.invalidateQueries({ queryKey: ["team-kpi-underperforming"] });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Failed to submit coaching.", tone: "error" });
    }
  });

  const handleOpenCoachingModal = (userId: string) => {
    setSelectedUserId(userId);
    setIsCoachingModalOpen(true);
  };

  const handlePostCoaching = () => {
    if (!selectedUserId || !coachingRemarks.trim()) return;
    coachingMutation.mutate({ userId: selectedUserId, remarks: coachingRemarks });
  };

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Top Header Row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Team KPI Dashboard</h1>
          <p className="text-sm text-brand-muted">Department Performance Overview</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="border border-[#c3c6d2] rounded-lg px-2.5 py-1 text-xs font-semibold bg-white flex items-center gap-1.5 cursor-pointer">
            <Calendar className="h-3.5 w-3.5 text-brand-muted" />
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              className="bg-transparent font-bold text-brand-navy outline-none border-none cursor-pointer"
            >
              <option value="This Quarter">This Quarter</option>
              <option value="Q1">Q1</option>
              <option value="Q2">Q2</option>
              <option value="Q3">Q3</option>
              <option value="Q4">Q4</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main KPI overview row (Chart left, Stats cards right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progress chart */}
        <div className="lg:col-span-2 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-bold text-brand-navy">Individual KPI Progress</h2>
          </div>

          {isChartLoading ? (
            <div className="h-64 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center">
              <HelpCircle className="h-10 w-10 text-brand-muted" />
              <p className="text-xs text-brand-muted mt-2">No team member progress data available.</p>
            </div>
          ) : (
            <>
              <div className="relative h-64 border-b border-l border-[#c3c6d2]/40">
                {[0, 25, 50, 75, 100].map((mark) => (
                  <div
                    key={mark}
                    className="absolute left-0 right-0 flex items-center gap-2"
                    style={{ bottom: `${mark}%` }}
                  >
                    <span className="w-8 -translate-x-full pr-2 text-right text-[10px] text-brand-muted">{mark}%</span>
                    <div className="h-px w-full bg-[#c3c6d2]/30" />
                  </div>
                ))}
                <div className="absolute inset-0 flex items-end justify-around px-6 pb-0.5">
                  {chartData.map((pt, idx) => {
                    const reached = pt.score >= TARGET_REACHED_THRESHOLD;
                    return (
                      <div key={idx} className="flex h-full flex-col items-center justify-end gap-1.5">
                        <div
                          className="relative flex flex-col items-center"
                          style={{ marginBottom: `${Math.max(0, Math.min(100, pt.score))}%` }}
                        >
                          <span
                            className={`h-3.5 w-3.5 rounded-full border-2 border-white shadow ${reached ? "bg-brand" : "bg-red-500"}`}
                            title={`${pt.name}: ${pt.score}%`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-around px-6">
                {chartData.map((pt, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-0.5 w-16">
                    <span className="text-[10px] font-bold text-brand-navy text-center truncate w-full">{pt.name}</span>
                    <span className="text-[10px] text-brand-muted font-medium">{pt.score}%</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-center gap-6 border-t border-[#c3c6d2]/30 pt-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-muted">
                  <span className="h-2.5 w-2.5 rounded-full bg-brand" /> Target Reached
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-muted">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Below Target
                </div>
              </div>
            </>
          )}
        </div>

        {/* Stats cards */}
        <div className="flex flex-col gap-6">
          {/* Team Average */}
          <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-sm flex flex-col justify-between flex-1">
            <div>
              <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block">Team Average</span>
              <div className="text-5xl font-extrabold text-brand-navy mt-3">
                {isSummaryLoading ? "..." : `${summary?.teamAverage ?? 75}%`}
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-[#15803d] mt-4">
              <TrendingUp className="h-4 w-4" />
              <span>{summary?.change ?? "+4% vs last quarter"}</span>
            </div>
          </div>

          {/* Members below target */}
          <div className="rounded-[16px] border border-red-100 bg-red-50/20 p-6 shadow-sm flex flex-col justify-between flex-1">
            <div>
              <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider block">Members Below Target</span>
              <div className="text-5xl font-extrabold text-red-600 mt-3">
                {isSummaryLoading ? "..." : summary?.belowTargetCount ?? 0}
              </div>
            </div>
            <div className="text-xs font-semibold text-red-600/90 mt-4">
              Requires attention
            </div>
          </div>
        </div>
      </div>

      {/* Underperforming grid */}
      <SectionCard title="Identify Underperforming Members">
        <p className="text-xs text-brand-muted -mt-4 mb-4">Metrics falling below the 60% acceptable threshold.</p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                <th className="py-3 px-4">Team Member</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Current KPI %</th>
                <th className="py-3 px-4">Target Variance</th>
                <th className="py-3 px-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c3c6d2]/30">
              {isUnderperformingLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand" />
                  </td>
                </tr>
              ) : underperforming.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-xs text-brand-muted">
                    No underperforming team members identified. All members are above the 60% threshold!
                  </td>
                </tr>
              ) : (
                underperforming.map((member) => {
                  const { firstName, lastName } = splitName(member.name);
                  return (
                  <tr key={member.userId} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar firstName={firstName} lastName={lastName} size="sm" />
                        <div>
                          <div className="font-semibold text-brand-navy">{member.name}</div>
                          <div className="text-[10px] text-brand-muted">Joined: {formatJoinedDate(member.joinedAt)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-xs font-semibold text-brand-muted">{member.role}</td>
                    <td className="py-4 px-4 text-brand-navy">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-red-600">{member.score}%</span>
                        <ProgressBar percent={member.score} className="w-24 h-1.5 [&>div]:bg-red-500" />
                      </div>
                    </td>
                    <td className="py-4 px-4 text-red-600 font-bold flex items-center gap-1.5">
                      <TrendingDown className="h-4.5 w-4.5" />
                      <span>{member.variance}%</span>
                    </td>
                    <td className="py-4 px-4">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleOpenCoachingModal(member.userId)}
                        className="bg-brand hover:bg-brand/90 text-white font-bold text-xs"
                      >
                        Provide Coaching Remarks
                      </Button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Coaching Modal */}
      {isCoachingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
          <div className="bg-white p-6 rounded-xl max-w-lg w-full border border-[#c3c6d2] shadow-xl">
            <h3 className="text-lg font-bold text-brand-navy mb-4">Provide Coaching Remarks</h3>
            <p className="text-xs text-brand-muted mb-4">
              Enter feedback or action guide steps below. AI will automatically evaluate alignment upon submission.
            </p>

            <textarea
              placeholder="e.g. Set specific targets for task velocity, minimize lunch disruptions..."
              value={coachingRemarks}
              onChange={(e) => setCoachingRemarks(e.target.value)}
              className="w-full rounded-lg border border-[#c3c6d2] p-3 text-sm outline-none focus:border-brand min-h-[120px] mb-6"
            />

            <div className="flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCoachingModalOpen(false);
                  setCoachingRemarks("");
                  setSelectedUserId(null);
                }}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handlePostCoaching}
                disabled={coachingMutation.isPending || !coachingRemarks.trim()}
                className="bg-brand hover:bg-brand/90 text-white font-bold text-xs"
              >
                {coachingMutation.isPending ? "Submitting..." : "Submit Remarks"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
