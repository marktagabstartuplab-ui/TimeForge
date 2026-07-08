"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import { getScrumDashboard } from "../api/scrum-management.service";
import { ScrumStatsCards } from "./ScrumStatsCards";
import { BlockerFeed } from "./BlockerFeed";
import { DepartmentHeatmap } from "./DepartmentHeatmap";
import { RecentSubmissions } from "./RecentSubmissions";
import { TeamStatusPanel } from "./TeamStatusPanel";
import { AiInsightCard } from "./AiInsightCard";
import { TeamScrumSubmissionsContent } from "./TeamScrumSubmissionsContent";
import { cn } from "@/lib/utils";

export function ScrumManagementContent() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"overview" | "submissions">("overview");

  const { data, isLoading } = useQuery({
    queryKey: ["scrum-mgmt", "dashboard"],
    queryFn: getScrumDashboard,
    refetchInterval: 60_000,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Daily Scrum Management</h1>
          <p className="text-sm text-brand-muted">Team submission health, blockers, and participation across the organization.</p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-[#f5f6fa] p-1 rounded-lg border border-[#c3c6d2]/20">
          <button
            onClick={() => setActiveTab("overview")}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-200",
              activeTab === "overview"
                ? "bg-white text-brand shadow-sm"
                : "text-brand-muted hover:text-brand-navy"
            )}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("submissions")}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-200",
              activeTab === "submissions"
                ? "bg-white text-brand shadow-sm"
                : "text-brand-muted hover:text-brand-navy"
            )}
          >
            Team Submissions
          </button>
        </div>
      </div>

      {activeTab === "overview" ? (
        <>
          <ScrumStatsCards data={data} isLoading={isLoading} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BlockerFeed />
            <DepartmentHeatmap />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <RecentSubmissions data={data} isLoading={isLoading} />
              <TeamStatusPanel data={data} isLoading={isLoading} />
            </div>
            {user ? <AiInsightCard userId={user.id} /> : null}
          </div>
        </>
      ) : (
        <TeamScrumSubmissionsContent />
      )}
    </div>
  );
}
