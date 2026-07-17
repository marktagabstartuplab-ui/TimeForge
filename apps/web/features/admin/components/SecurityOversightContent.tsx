"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  ShieldAlert, 
  ShieldCheck, 
  RefreshCw, 
  Download, 
  FileText,
  Search,
  MapPin,
  Clock,
  UserCheck,
  Server,
  Lock,
  ArrowDown,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { 
  getSecurityLogs, 
  getSecurityAlerts, 
  getSecurityHealth, 
  exportSecurityLogs 
} from "../api/security.service";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 24 * 60 * 60 * 1000) return "Today";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SecurityOversightContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  
  // Filters state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [timeRange, setTimeRange] = useState<string>("24h");
  
  // Pagination
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [cursorIndex, setCursorIndex] = useState(0);

  const queryParams = {
    q: search || undefined,
    status: statusFilter === "ALL" ? undefined : statusFilter,
    timeRange: timeRange === "all" ? undefined : timeRange,
    cursor: cursorStack[cursorIndex] || undefined,
    limit: 10,
  };

  // Queries
  const { data: logsData, isLoading: isLogsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ["security", "logs", queryParams],
    queryFn: () => getSecurityLogs(queryParams),
  });

  const { data: alerts = [], isLoading: isAlertsLoading } = useQuery({
    queryKey: ["security", "alerts"],
    queryFn: getSecurityAlerts,
    refetchInterval: 15_000, // refresh alerts every 15s
  });

  const { data: health, isLoading: isHealthLoading } = useQuery({
    queryKey: ["security", "health"],
    queryFn: getSecurityHealth,
    refetchInterval: 30_000,
  });

  // Export CSV Mutation
  const exportMutation = useMutation({
    mutationFn: exportSecurityLogs,
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `security_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setToast({ message: "Security logs exported successfully.", tone: "success" });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Export failed.", tone: "error" });
    }
  });

  const handleNextPage = () => {
    if (logsData?.page.nextCursor) {
      const nextCursor = logsData.page.nextCursor;
      setCursorStack((prev) => [...prev, nextCursor]);
      setCursorIndex((prev) => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (cursorIndex > 0) {
      setCursorIndex((prev) => prev - 1);
    }
  };

  const handleClearAll = () => {
    setSearch("");
    setStatusFilter("ALL");
    setTimeRange("all");
    setCursorStack([null]);
    setCursorIndex(0);
  };

  const logs = logsData?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-brand-navy">Security Logs & Auditing</h1>
        <p className="text-sm text-brand-muted">Real-time threat monitoring, compliance logs, and lockout settings.</p>
      </div>

      {/* Top Section: Alerts & Quick Stats */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Real-time Alerts */}
        <div className="lg:col-span-2 rounded-[16px] border border-red-200/60 bg-red-50/10 p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-600 animate-pulse" />
              <h2 className="text-lg font-bold text-brand-navy">Real-time Security Alerts</h2>
            </div>
            {alerts.length > 0 ? (
              <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                {alerts.length} Critical
              </span>
            ) : (
              <span className="text-xs font-semibold text-[#15803d] bg-[#f0fdf4] px-2 py-0.5 rounded-full uppercase tracking-wider">
                System Secure
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3 max-h-52 overflow-y-auto">
            {isAlertsLoading ? (
              <div className="animate-pulse flex flex-col gap-3">
                <div className="h-16 bg-gray-100 rounded-lg w-full"></div>
                <div className="h-16 bg-gray-100 rounded-lg w-full"></div>
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-brand-muted text-sm gap-2">
                <ShieldCheck className="h-8 w-8 text-[#15803d]" />
                No active security threats detected.
              </div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} className="border-l-4 border-red-500 bg-white p-4 rounded-r-lg shadow-sm flex justify-between items-start gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-brand-navy text-sm">{alert.title}</span>
                      <span className="text-xs text-brand-muted">•</span>
                      <span className="text-xs text-brand-muted">{formatDate(alert.createdAt)} {formatTime(alert.createdAt)}</span>
                    </div>
                    <span className="text-xs text-brand-muted">{alert.description}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Health, Compliance & Activity Widget */}
        <div className="flex flex-col gap-4">
          {/* System Health */}
          <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
            <span className="text-xs font-bold text-brand-muted uppercase tracking-wider">System Health</span>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-[#0052cc]">
                {isHealthLoading ? "..." : `${health?.uptimePercent}%`}
              </span>
              <span className="text-xs font-semibold text-brand-muted uppercase">Uptime</span>
            </div>
            <div className="mt-4 w-full bg-gray-100 rounded-full h-2">
              <div className="bg-[#0052cc] h-2 rounded-full" style={{ width: `${health?.uptimePercent ?? 99.9}%` }}></div>
            </div>
            <p className="mt-3 text-xs text-brand-muted">Last check: 3 seconds ago</p>
          </div>

          {/* Threat level mini indicator chart */}
          <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
            <span className="text-xs font-bold text-brand-muted uppercase tracking-wider">Threat Level Indicator</span>
            <div className="mt-4 flex items-end justify-between h-14 px-2">
              {isHealthLoading ? (
                <div className="text-xs text-brand-muted w-full text-center">Loading trend...</div>
              ) : health?.threatLevelByDay && health.threatLevelByDay.length > 0 ? (
                health.threatLevelByDay.map((t, idx) => {
                  const barHeight = Math.min(4 + t.count * 12, 48);
                  const isToday = idx === health.threatLevelByDay!.length - 1;
                  return (
                    <div key={t.day} className="flex flex-col items-center gap-1.5 w-8">
                      <div 
                        className={cn(
                          "w-3 rounded-t transition-all duration-300",
                          t.count > 0 
                            ? (isToday ? "bg-red-500 animate-pulse" : "bg-red-400") 
                            : (isToday ? "bg-sky-400" : "bg-gray-200")
                        )}
                        style={{ height: `${barHeight}px` }}
                        title={`${t.count} failed/denied requests`}
                      />
                      <span className="text-[10px] text-brand-muted font-bold">{t.day}</span>
                    </div>
                  );
                })
              ) : (
                ["MON", "TUE", "WED", "THU", "FRI"].map((day) => (
                  <div key={day} className="flex flex-col items-center gap-1.5 w-8">
                    <div className="bg-gray-100 w-3 h-2 rounded-t" />
                    <span className="text-[10px] text-brand-muted font-bold">{day}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-white border border-[#c3c6d2]/40 rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-muted" />
            <Input 
              placeholder="Search user, action, IP..." 
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCursorStack([null]);
                setCursorIndex(0);
              }}
              className="pl-9 h-9 text-sm"
            />
          </div>

          <div className="flex items-center border border-[#c3c6d2] rounded-lg px-2 py-1 gap-1">
            <span className="text-xs text-brand-muted font-semibold">Status:</span>
            <select 
              value={statusFilter} 
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCursorStack([null]);
                setCursorIndex(0);
              }}
              className="bg-transparent text-xs font-bold text-brand-navy outline-none border-none cursor-pointer"
            >
              <option value="ALL">All</option>
              <option value="SUCCESS">Success</option>
              <option value="DENIED">Denied</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>

          <div className="flex items-center border border-[#c3c6d2] rounded-lg px-2 py-1 gap-1">
            <span className="text-xs text-brand-muted font-semibold">Time:</span>
            <select 
              value={timeRange} 
              onChange={(e) => {
                setTimeRange(e.target.value);
                setCursorStack([null]);
                setCursorIndex(0);
              }}
              className="bg-transparent text-xs font-bold text-brand-navy outline-none border-none cursor-pointer"
            >
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7d</option>
              <option value="30d">Last 30d</option>
              <option value="all">All-time</option>
            </select>
          </div>

          <button 
            onClick={handleClearAll}
            className="text-xs font-semibold text-[#0052cc] hover:underline"
          >
            Clear all
          </button>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            className="h-9 text-xs font-semibold"
          >
            <Download className="h-3.5 w-3.5 mr-2" /> Export CSV
          </Button>
          <Button 
            variant="default"
            onClick={() => refetchLogs()}
            className="h-9 text-xs font-semibold bg-[#0052cc] hover:bg-[#004bb3]"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Live Refresh
          </Button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                <th className="py-3 px-4 flex items-center gap-1">
                  Timestamp <ArrowDown className="h-3 w-3" />
                </th>
                <th className="py-3 px-4">User Instance</th>
                <th className="py-3 px-4">Event Action</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c3c6d2]/30 text-sm">
              {isLogsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-20"></div></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-40"></div></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-24"></div></td>
                    <td className="py-4 px-4"><div className="h-6 bg-gray-100 rounded w-16"></div></td>
                    <td className="py-4 px-4"><div className="h-4 bg-gray-100 rounded w-28"></div></td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-brand-muted">
                    No security events found matching the criteria.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  let tone: BadgeTone = "success";
                  if (log.status === "DENIED") tone = "danger";
                  else if (log.status === "PENDING") tone = "warning";

                  const email = log.user?.email || "Unauthenticated Request";
                  const initial = email.slice(0, 2).toUpperCase();
                  const role = log.user?.jobTitle || (log.user ? "User" : "External Origin");
                  const timestamp = new Date(log.createdAt);

                  return (
                    <tr key={log.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="py-4 px-4 text-brand-navy">
                        <div className="font-semibold">{formatDate(log.createdAt)}, {formatTime(log.createdAt)}</div>
                        <div className="text-[10px] text-brand-muted mt-0.5">ms: {timestamp.getMilliseconds()}</div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                            log.user ? "bg-gray-100 text-brand-navy" : "bg-red-50 text-red-500"
                          )}>
                            {log.user ? initial : "?"}
                          </div>
                          <div>
                            <div className={cn(
                              "font-semibold text-brand-ink text-sm",
                              !log.user && "text-red-500 font-bold"
                            )}>
                              {email}
                            </div>
                            <div className="text-xs text-brand-muted mt-0.5">{role}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-brand-muted font-medium">
                        <span className="flex items-center gap-1.5">
                          {log.action.includes("LOGIN") ? (
                            <Clock className="h-4 w-4 text-brand-muted" />
                          ) : log.action.includes("PAYROLL") ? (
                            <UserCheck className="h-4 w-4 text-brand-muted" />
                          ) : (
                            <Server className="h-4 w-4 text-brand-muted" />
                          )}
                          {log.action}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <StatusBadge label={log.status} tone={tone} />
                      </td>
                      <td className="py-4 px-4 font-mono text-xs text-brand-navy bg-gray-50/50 rounded px-2.5 py-1 inline-block mt-3 ml-4">
                        {log.ipAddress}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-[#c3c6d2]/30 pt-4 mt-4">
          <span className="text-xs text-brand-muted">
            Showing logs for query scope
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={cursorIndex === 0}
              onClick={handlePrevPage}
              className="h-8 text-xs px-3"
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!logsData?.page.nextCursor}
              onClick={handleNextPage}
              className="h-8 text-xs px-3"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom widgets */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Access Map */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <h3 className="text-sm font-bold text-brand-navy flex items-center gap-1.5 mb-3">
            <MapPin className="h-4 w-4 text-[#0052cc]" /> Access Map
          </h3>
          <div className="relative bg-gray-100 rounded-lg overflow-hidden h-40 border border-gray-200 flex items-center justify-center">
            {/* Draw a stylized representation of map grids using Tailwind styles */}
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]"></div>
            <div className="h-10 px-4 bg-[#0052cc]/10 border border-[#0052cc]/30 rounded-full flex items-center justify-center gap-1.5 shadow">
              <span className="h-2 w-2 rounded-full bg-[#0052cc] animate-ping"></span>
              <span className="text-xs font-bold text-brand-navy">
                Active Session: {isHealthLoading ? "..." : (health?.lastGeoLocation || "Manila, PH")}
              </span>
            </div>
          </div>
        </div>

        {/* Security Compliance */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-brand-navy flex items-center gap-1.5 mb-4">
              <ShieldCheck className="h-4 w-4 text-[#15803d]" /> Security Compliance
            </h3>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between border-b border-[#c3c6d2]/20 pb-2">
                <span className="text-brand-muted">SOC2 Controls</span>
                <span className="font-bold text-[#15803d]">
                  {isHealthLoading ? "..." : (health?.compliance?.soc2 || "Compliant")}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[#c3c6d2]/20 pb-2">
                <span className="text-brand-muted">GDPR Compliance</span>
                <span className="font-bold text-[#15803d]">
                  {isHealthLoading ? "..." : (health?.compliance?.gdpr || "Compliant")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brand-muted">Last Audit</span>
                <span className="font-bold text-brand-navy">
                  {isHealthLoading ? "..." : health?.compliance?.lastAuditDate ? formatDate(health.compliance.lastAuditDate) : "N/A"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Lockout Policy */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] flex flex-col justify-between relative overflow-hidden">
          <div>
            <h3 className="text-sm font-bold text-brand-navy flex items-center gap-1.5 mb-3">
              <Lock className="h-4 w-4 text-[#be123c]" /> Audit Lockout Policy
            </h3>
            <p className="text-xs text-brand-muted leading-relaxed mb-4">
              Users will be locked out after 5 consecutive failed attempts for a duration of 30 minutes.
            </p>
          </div>
          <Button variant="outline" className="w-full text-xs font-semibold border-gray-200">
            Manage Policy
          </Button>
          <div className="absolute -bottom-8 -right-8 opacity-5 text-brand-navy pointer-events-none">
            <Lock className="h-32 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
