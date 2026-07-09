"use client";

import { useQuery } from "@tanstack/react-query";
import { SearchInput } from "@/components/shared/SearchInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { listDepartments } from "../api/leave-supervisor.service";

const LEAVE_TYPE_OPTIONS = [
  { value: "ANNUAL", label: "Annual Leave" },
  { value: "SICK", label: "Sick Leave" },
  { value: "PERSONAL", label: "Personal Leave" },
] as const;

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export interface LeaveFilters {
  search: string;
  type: string;
  status: string;
  departmentId: string;
  startDate: string;
  endDate: string;
}

interface LeaveFiltersBarProps {
  filters: LeaveFilters;
  onFiltersChange: (filters: LeaveFilters) => void;
}

export function LeaveFiltersBar({ filters, onFiltersChange }: LeaveFiltersBarProps) {
  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: listDepartments,
    staleTime: 5 * 60_000,
  });

  const update = (partial: Partial<LeaveFilters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[12px] bg-[#f6f3f4] p-4">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Employee</Label>
        <SearchInput
          placeholder="Search employee…"
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          className="h-8 w-44"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Leave Type</Label>
        <Select
          value={filters.type || null}
          onValueChange={(v) => update({ type: v ?? "" })}
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Types</SelectItem>
            {LEAVE_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Status</Label>
        <Select
          value={filters.status || null}
          onValueChange={(v) => update({ status: v ?? "" })}
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Department</Label>
        <Select
          value={filters.departmentId || null}
          onValueChange={(v) => update({ departmentId: v ?? "" })}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">From</Label>
        <Input
          type="date"
          value={filters.startDate}
          onChange={(e) => update({ startDate: e.target.value })}
          className="h-8 w-36"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">To</Label>
        <Input
          type="date"
          value={filters.endDate}
          onChange={(e) => update({ endDate: e.target.value })}
          className="h-8 w-36"
        />
      </div>
    </div>
  );
}
