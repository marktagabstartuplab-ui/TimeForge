"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/shared/ConfirmationDialog";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ApiError } from "@/lib/api/client";
import { getOrgDashboard, deleteDepartment, deleteProject, type DepartmentRow, type ProjectRow } from "../api/org-management.service";
import { OrgSummaryCards } from "./OrgSummaryCards";
import { OrgWorkflowPanel } from "./OrgWorkflowPanel";
import { DepartmentDirectoryTable } from "./DepartmentDirectoryTable";
import { ActiveProjectsTable } from "./ActiveProjectsTable";
import { OrgAnalyticsCharts } from "./OrgAnalyticsCharts";
import { AddDepartmentModal } from "./AddDepartmentModal";
import { CreateProjectModal } from "./CreateProjectModal";
import { AssignSupervisorModal } from "./AssignSupervisorModal";
import { AssignEmployeesModal } from "./AssignEmployeesModal";
import { ExportOrgButton } from "./ExportOrgButton";

export function OrgManagementContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);

  const [departmentModalOpen, setDepartmentModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<DepartmentRow | null>(null);
  const [deleteDepartmentTarget, setDeleteDepartmentTarget] = useState<DepartmentRow | null>(null);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<ProjectRow | null>(null);

  const [assignSupervisorOpen, setAssignSupervisorOpen] = useState(false);
  const [assignEmployeesOpen, setAssignEmployeesOpen] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["org-management", "dashboard"], queryFn: getOrgDashboard });

  const invalidateAll = () => queryClient.invalidateQueries({ queryKey: ["org-management"] });

  const deleteDepartmentMutation = useMutation({
    mutationFn: () => deleteDepartment(deleteDepartmentTarget!.id, deleteDepartmentTarget!.version),
    onSuccess: () => {
      setToast({ message: "Department deleted.", tone: "success" });
      setDeleteDepartmentTarget(null);
      invalidateAll();
    },
    onError: (err) => setToast({ message: err instanceof ApiError ? err.message : "Failed to delete department.", tone: "error" }),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: () => deleteProject(deleteProjectTarget!.id, deleteProjectTarget!.version),
    onSuccess: () => {
      setToast({ message: "Project deleted.", tone: "success" });
      setDeleteProjectTarget(null);
      invalidateAll();
    },
    onError: (err) => setToast({ message: err instanceof ApiError ? err.message : "Failed to delete project.", tone: "error" }),
  });

  const departments = data?.departments ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Organizational Management</h1>
          <p className="text-sm text-brand-muted">Manage departments, projects, and structural hierarchies across the workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => { setEditingDepartment(null); setDepartmentModalOpen(true); }}>
            <Plus aria-hidden="true" />
            Add Department
          </Button>
          <Button type="button" onClick={() => { setEditingProject(null); setProjectModalOpen(true); }}>
            <FolderPlus aria-hidden="true" />
            Create Project
          </Button>
        </div>
      </div>

      <OrgSummaryCards data={data} isLoading={isLoading} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <OrgWorkflowPanel
            onEditDepartments={() => { setEditingDepartment(null); setDepartmentModalOpen(true); }}
            onEditProject={() => { setEditingProject(null); setProjectModalOpen(true); }}
            onAssignSupervisor={() => setAssignSupervisorOpen(true)}
            onAssignEmployees={() => setAssignEmployeesOpen(true)}
          />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DepartmentDirectoryTable
            departments={data?.departments}
            isLoading={isLoading}
            onEdit={(d) => { setEditingDepartment(d); setDepartmentModalOpen(true); }}
            onDelete={(d) => setDeleteDepartmentTarget(d)}
          />
          <ActiveProjectsTable
            projects={data?.projects}
            isLoading={isLoading}
            onEdit={(p) => { setEditingProject(p); setProjectModalOpen(true); }}
            onDelete={(p) => setDeleteProjectTarget(p)}
          />
        </div>
      </div>

      <OrgAnalyticsCharts />

      <div className="flex items-center justify-between rounded-[12px] border border-[#c3c6d2]/50 bg-white px-5 py-3 text-sm text-brand-muted">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
          All systems operational
          {data?.generatedAt ? ` — Last updated: ${new Date(data.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
        </span>
        <ExportOrgButton onToast={setToast} />
      </div>

      <AddDepartmentModal
        open={departmentModalOpen}
        onOpenChange={setDepartmentModalOpen}
        department={editingDepartment}
        onToast={setToast}
      />
      <CreateProjectModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        project={editingProject}
        departments={departments}
        onToast={setToast}
      />
      <AssignSupervisorModal
        open={assignSupervisorOpen}
        onOpenChange={setAssignSupervisorOpen}
        departments={departments}
        onToast={setToast}
      />
      <AssignEmployeesModal
        open={assignEmployeesOpen}
        onOpenChange={setAssignEmployeesOpen}
        departments={departments}
        onToast={setToast}
      />

      <ConfirmationDialog
        open={Boolean(deleteDepartmentTarget)}
        onOpenChange={(open) => { if (!open) setDeleteDepartmentTarget(null); }}
        title={`Delete "${deleteDepartmentTarget?.name}"?`}
        description="This department will be removed. Employees and projects assigned to it will keep their existing assignment but the department record will no longer appear in listings."
        confirmLabel="Delete"
        destructive
        pending={deleteDepartmentMutation.isPending}
        onConfirm={() => deleteDepartmentMutation.mutate()}
      />
      <ConfirmationDialog
        open={Boolean(deleteProjectTarget)}
        onOpenChange={(open) => { if (!open) setDeleteProjectTarget(null); }}
        title={`Delete "${deleteProjectTarget?.name}"?`}
        description="This project will be removed from active listings."
        confirmLabel="Delete"
        destructive
        pending={deleteProjectMutation.isPending}
        onConfirm={() => deleteProjectMutation.mutate()}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
