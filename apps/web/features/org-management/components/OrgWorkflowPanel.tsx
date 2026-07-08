"use client";

import { Building2, ClipboardList, UserPlus2, Share2 } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";

interface OrgWorkflowPanelProps {
  onEditDepartments: () => void;
  onEditProject: () => void;
  onAssignSupervisor: () => void;
  onAssignEmployees: () => void;
}

export function OrgWorkflowPanel({ onEditDepartments, onEditProject, onAssignSupervisor, onAssignEmployees }: OrgWorkflowPanelProps) {
  return (
    <SectionCard title="Hierarchical Logic" action={<Share2 className="h-5 w-5 text-brand-muted" aria-hidden="true" />}>
      <div className="flex flex-col gap-3">
        <div className="rounded-[12px] border border-[#c3c6d2]/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-brand-muted">Step 01</p>
              <p className="text-sm font-bold text-brand-navy">Department Management</p>
            </div>
            <Building2 className="h-5 w-5 text-brand" aria-hidden="true" />
          </div>
          <div className="mt-3 flex justify-center">
            <Button type="button" variant="outline" size="sm" onClick={onEditDepartments}>
              View &amp; Edit Departments
            </Button>
          </div>
        </div>

        <div className="flex justify-center text-brand-muted/50">↓</div>

        <div className="rounded-[12px] border border-[#c3c6d2]/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-brand-muted">Step 02</p>
              <p className="text-sm font-bold text-brand-navy">Project Management</p>
            </div>
            <ClipboardList className="h-5 w-5 text-brand" aria-hidden="true" />
          </div>
          <div className="mt-3 flex justify-center">
            <Button type="button" variant="outline" size="sm" onClick={onEditProject}>
              Add or Edit Project
            </Button>
          </div>
        </div>

        <div className="flex justify-center text-brand-muted/50">↓</div>

        <div className="rounded-[12px] border border-[#c3c6d2]/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-brand-muted">Step 03</p>
              <p className="text-sm font-bold text-brand-navy">Personnel Assignment</p>
            </div>
            <UserPlus2 className="h-5 w-5 text-brand" aria-hidden="true" />
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onAssignSupervisor}>
              Assign Supervisor
            </Button>
            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onAssignEmployees}>
              Assign Employees
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
