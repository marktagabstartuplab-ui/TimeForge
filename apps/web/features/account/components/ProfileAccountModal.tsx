"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, User } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogCloseButton } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { ConfirmationDialog } from "@/components/shared/ConfirmationDialog";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ApiError } from "@/lib/api/client";
import { profileSchema, type ProfileValues } from "../schemas/account.schema";
import { getMe, updateProfile } from "../api/account.service";
import { getEmployee, updateEmployee, listEmployees, type EmployeeRow } from "@/features/employee-management/api/employee-management.service";
import { useProfileModalStore } from "../store/profile-modal.store";
import { PersonalInfoCard } from "./PersonalInfoCard";
import { ProfessionalDetailsCard } from "./ProfessionalDetailsCard";
import { SecuritySection } from "./SecuritySection";
import { apiClient } from "@/lib/api/client";

interface DepartmentRef {
  id: string;
  name: string;
}

export function ProfileAccountModal() {
  const isOpen = useProfileModalStore((s) => s.isOpen);
  const targetUserId = useProfileModalStore((s) => s.targetUserId);
  const close = useProfileModalStore((s) => s.close);
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  /** null targetUserId = "my own" profile (self-service, full editing incl. avatar/security);
   *  set = an Admin viewing/editing another employee from Employee Management (no avatar/security actions). */
  const isViewingOther = Boolean(targetUserId);

  // Admin-only: editable professional fields
  const [editDepartmentId, setEditDepartmentId] = useState<string>("");
  const [editEmploymentType, setEditEmploymentType] = useState<string>("");
  const [editSupervisorId, setEditSupervisorId] = useState<string>("");

  const meQuery = useQuery({
    queryKey: isViewingOther ? ["employee-management", "employee", targetUserId] : ["account", "me"],
    queryFn: () => (isViewingOther ? getEmployee(targetUserId!) : getMe()),
    enabled: isOpen,
  });

  // Fetch departments for the admin dropdown
  const { data: departments } = useQuery({
    queryKey: ["auth", "departments"],
    queryFn: async (): Promise<DepartmentRef[]> => {
      const { data } = await apiClient.get<DepartmentRef[]>("/auth/departments");
      return data;
    },
    enabled: isOpen && isViewingOther,
  });

  // Fetch supervisors (ACTIVE employees with SUPERVISOR or ADMIN role) for the admin dropdown
  const { data: supervisorsPage } = useQuery({
    queryKey: ["employee-management", "supervisors"],
    queryFn: () => listEmployees({ limit: 100, role: "SUPERVISOR" }),
    enabled: isOpen && isViewingOther,
  });
  const supervisors = supervisorsPage?.data ?? [];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: "", lastName: "", phone: "" },
  });

  // Prefill once the profile loads (or reloads after a save elsewhere, e.g. avatar upload).
  useEffect(() => {
    if (meQuery.data) {
      reset({ firstName: meQuery.data.firstName, lastName: meQuery.data.lastName, phone: meQuery.data.phone ?? "" });
      if (isViewingOther) {
        setEditDepartmentId(meQuery.data.departmentId ?? "");
        setEditEmploymentType(meQuery.data.employmentType ?? "EMPLOYEE");
        setEditSupervisorId(meQuery.data.supervisor?.id ?? "");
      }
    }
  }, [meQuery.data, reset, isViewingOther]);

  const saveProfile = useMutation({
    mutationFn: (values: ProfileValues) => {
      const payload = { ...values, phone: values.phone || undefined };
      if (isViewingOther) {
        const version = (meQuery.data as EmployeeRow).version;
        return updateEmployee(targetUserId!, {
          ...payload,
          departmentId: editDepartmentId || undefined,
          employmentType: editEmploymentType || undefined,
          supervisorId: editSupervisorId || null,
          version,
        });
      }
      return updateProfile(payload);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(isViewingOther ? ["employee-management", "employee", targetUserId] : ["account", "me"], updated);
      if (isViewingOther) queryClient.invalidateQueries({ queryKey: ["employee-management", "employees"] });
      reset({ firstName: updated.firstName, lastName: updated.lastName, phone: updated.phone ?? "" });
      if (isViewingOther) {
        setEditDepartmentId(updated.departmentId ?? "");
        setEditEmploymentType(updated.employmentType ?? "EMPLOYEE");
        setEditSupervisorId(updated.supervisor?.id ?? "");
      }
      setToast({ message: isViewingOther ? "Employee updated." : "Profile updated.", tone: "success" });
      close();
    },
    onError: (err) => {
      setToast({ message: err instanceof ApiError ? err.message : "Something went wrong", tone: "error" });
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next && isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    if (!next) close();
  }

  function handleDiscardConfirmed() {
    setConfirmDiscardOpen(false);
    if (meQuery.data) {
      reset({ firstName: meQuery.data.firstName, lastName: meQuery.data.lastName, phone: meQuery.data.phone ?? "" });
      if (isViewingOther) {
        setEditDepartmentId(meQuery.data.departmentId ?? "");
        setEditEmploymentType(meQuery.data.employmentType ?? "EMPLOYEE");
        setEditSupervisorId(meQuery.data.supervisor?.id ?? "");
      }
    }
    close();
  }

  // Check if professional details have changed (admin mode)
  const professionalDirty = isViewingOther && meQuery.data
    ? editDepartmentId !== (meQuery.data.departmentId ?? "")
      || editEmploymentType !== (meQuery.data.employmentType ?? "EMPLOYEE")
      || editSupervisorId !== (meQuery.data.supervisor?.id ?? "")
    : false;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="flex w-[min(960px,calc(100vw-2rem))] max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between border-b border-[#c3c6d2]/50 px-6 py-4">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-brand" aria-hidden="true" />
              <DialogTitle>{isViewingOther ? "Employee Profile" : "Profile & Account"}</DialogTitle>
            </div>
            <DialogCloseButton />
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {meQuery.isLoading ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Skeleton className="h-96 w-full" />
                <Skeleton className="h-96 w-full" />
              </div>
            ) : meQuery.isError || !meQuery.data ? (
              <ErrorState message="Couldn't load this profile." onRetry={() => meQuery.refetch()} />
            ) : (
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <PersonalInfoCard
                    me={meQuery.data}
                    register={register}
                    errors={errors}
                    onToast={setToast}
                    allowAvatarUpload={!isViewingOther}
                  />
                  <ProfessionalDetailsCard
                    me={meQuery.data}
                    isEditing={isViewingOther}
                    departments={departments ?? []}
                    supervisors={supervisors}
                    selectedDepartmentId={editDepartmentId}
                    selectedEmploymentType={editEmploymentType}
                    selectedSupervisorId={editSupervisorId}
                    onDepartmentChange={setEditDepartmentId}
                    onEmploymentTypeChange={setEditEmploymentType}
                    onSupervisorChange={setEditSupervisorId}
                  />
                </div>
                {isViewingOther ? null : <SecuritySection me={meQuery.data} onToast={setToast} />}
              </div>
            )}
          </div>

          {meQuery.data ? (
            <div className="flex items-center justify-end gap-3 border-t border-[#c3c6d2]/50 px-6 py-4">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit((values) => saveProfile.mutate(values))}
                disabled={saveProfile.isPending || (!isDirty && !professionalDirty)}
              >
                {saveProfile.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Save Changes
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="Discard unsaved changes?"
        description="You have unsaved changes to this profile. Closing now will discard them."
        confirmLabel="Discard"
        destructive
        onConfirm={handleDiscardConfirmed}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
