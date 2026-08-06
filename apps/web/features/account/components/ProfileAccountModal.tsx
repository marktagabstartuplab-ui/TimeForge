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
import { getEmployee, updateEmployee, listEmployees, assignRoles, type EmployeeRow } from "@/features/employee-management/api/employee-management.service";
import { useProfileModalStore } from "../store/profile-modal.store";
import { PersonalInfoCard } from "./PersonalInfoCard";
import { ProfessionalDetailsCard } from "./ProfessionalDetailsCard";
import { SecuritySection } from "./SecuritySection";
import { apiClient } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";

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
  const { user } = useAuth();
  const isAdmin = user?.roles.includes("ADMIN") || false;
  const isAdminOrFinance = user?.roles.some((r) => r === "ADMIN" || r === "FINANCE") || false;

  /** null targetUserId = "my own" profile (self-service, full editing incl. avatar/security);
   *  set = viewing another employee's profile (from Employee Management, or a Supervisor
   *  opening a team member's card). Only Admin can edit name/department/employment/
   *  supervisor here; Finance may additionally edit the hourly rate. Anyone else viewing
   *  someone else's profile (e.g. Supervisor) gets a read-only view — the backend
   *  (user:update) would reject their edits anyway, so the UI shouldn't offer them. */
  const isViewingOther = Boolean(targetUserId);
  const canEditOtherProfile = isViewingOther && isAdmin;

  // Admin-only: editable professional fields
  const [editDepartmentId, setEditDepartmentId] = useState<string>("");
  const [editEmploymentType, setEditEmploymentType] = useState<string>("");
  const [editSupervisorId, setEditSupervisorId] = useState<string>("");
  const [editCompensationType, setEditCompensationType] = useState<string>("HOURLY");
  const [editHourlyRate, setEditHourlyRate] = useState<string>("");
  const [editDailyRate, setEditDailyRate] = useState<string>("");
  const [editDaysPerWeek, setEditDaysPerWeek] = useState<string>("5");
  const [editRoleKey, setEditRoleKey] = useState<string>("");

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
        setEditCompensationType(meQuery.data.compensationType ?? "HOURLY");
        setEditHourlyRate(meQuery.data.hourlyRate != null ? String(meQuery.data.hourlyRate) : "");
        setEditDailyRate(meQuery.data.dailyRate != null ? String(meQuery.data.dailyRate) : "");
        setEditDaysPerWeek(meQuery.data.daysPerWeek != null ? String(meQuery.data.daysPerWeek) : "5");
        setEditRoleKey(meQuery.data.roles[0]?.role.key ?? "EMPLOYEE");
      }
    }
  }, [meQuery.data, reset, isViewingOther]);

  const saveProfile = useMutation({
    mutationFn: async (values: ProfileValues) => {
      const payload = { ...values, phone: values.phone || undefined };
      if (isViewingOther) {
        let currentVersion = (meQuery.data as EmployeeRow).version;
        const originalCompType = meQuery.data?.compensationType ?? "HOURLY";
        const originalHourlyRate = meQuery.data?.hourlyRate != null ? String(meQuery.data.hourlyRate) : "";
        const originalDailyRate = meQuery.data?.dailyRate != null ? String(meQuery.data.dailyRate) : "";
        const originalDaysPerWeek = meQuery.data?.daysPerWeek != null ? String(meQuery.data.daysPerWeek) : "5";

        const rateChanged = isAdminOrFinance && (
          editCompensationType !== originalCompType ||
          editHourlyRate !== originalHourlyRate ||
          editDailyRate !== originalDailyRate ||
          editDaysPerWeek !== originalDaysPerWeek
        );

        // If compensation rate/type changed and viewer has permission, update the rate
        if (rateChanged) {
          const rateRes = await apiClient.patch(`/payroll/rates/${targetUserId}`, {
            compensationType: editCompensationType,
            hourlyRate: parseFloat(editHourlyRate) || 0,
            dailyRate: parseFloat(editDailyRate) || 0,
            daysPerWeek: parseFloat(editDaysPerWeek) || 5,
            version: currentVersion,
          });
          // The rate update increments the user's version, so we must use the new version for updateEmployee
          currentVersion = rateRes.data.version;
        }

        // A non-Admin viewer (e.g. Finance, editing only the rate) doesn't hold
        // user:update — calling updateEmployee for them would 403. Only Admin
        // touches name/department/employment/supervisor via this endpoint.
        if (!canEditOtherProfile) {
          return rateChanged ? getEmployee(targetUserId!) : (meQuery.data as EmployeeRow);
        }

        // Promote/demote (Admin only). Separate endpoint from updateEmployee —
        // replaces the user's whole role set, so it must run before the profile
        // refetch below so the returned row carries the new role.
        const originalRoleKey = meQuery.data?.roles[0]?.role.key ?? "EMPLOYEE";
        if (editRoleKey && editRoleKey !== originalRoleKey) {
          await assignRoles(targetUserId!, [editRoleKey]);
        }

        return updateEmployee(targetUserId!, {
          ...payload,
          departmentId: editDepartmentId || undefined,
          employmentType: editEmploymentType || undefined,
          supervisorId: editSupervisorId || null,
          version: currentVersion,
        });
      }
      return updateProfile(payload);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(isViewingOther ? ["employee-management", "employee", targetUserId] : ["account", "me"], updated);
      if (isViewingOther) {
        queryClient.invalidateQueries({ queryKey: ["employee-management", "employees"] });
        queryClient.invalidateQueries({ queryKey: ["payroll"] });
      }
      reset({ firstName: updated.firstName, lastName: updated.lastName, phone: updated.phone ?? "" });
      if (isViewingOther) {
        setEditDepartmentId(updated.departmentId ?? "");
        setEditEmploymentType(updated.employmentType ?? "EMPLOYEE");
        setEditSupervisorId(updated.supervisor?.id ?? "");
        setEditCompensationType(updated.compensationType ?? "HOURLY");
        setEditHourlyRate(updated.hourlyRate != null ? String(updated.hourlyRate) : "");
        setEditDailyRate(updated.dailyRate != null ? String(updated.dailyRate) : "");
        setEditDaysPerWeek(updated.daysPerWeek != null ? String(updated.daysPerWeek) : "5");
        setEditRoleKey(updated.roles[0]?.role.key ?? "EMPLOYEE");
      }
      setToast({ message: isViewingOther ? "Employee updated." : "Profile updated.", tone: "success" });
      close();
    },
    onError: (err) => {
      setToast({ message: err instanceof ApiError ? err.message : "Something went wrong", tone: "error" });
    },
  });

  function handleOpenChange(next: boolean) {
    if (!next && (isDirty || professionalDirty)) {
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
        setEditCompensationType(meQuery.data.compensationType ?? "HOURLY");
        setEditHourlyRate(meQuery.data.hourlyRate != null ? String(meQuery.data.hourlyRate) : "");
        setEditDailyRate(meQuery.data.dailyRate != null ? String(meQuery.data.dailyRate) : "");
        setEditDaysPerWeek(meQuery.data.daysPerWeek != null ? String(meQuery.data.daysPerWeek) : "5");
        setEditRoleKey(meQuery.data.roles[0]?.role.key ?? "EMPLOYEE");
      }
    }
    close();
  }

  // Check if professional details have changed (admin mode)
  const professionalDirty = isViewingOther && meQuery.data
    ? editDepartmentId !== (meQuery.data.departmentId ?? "")
      || editEmploymentType !== (meQuery.data.employmentType ?? "EMPLOYEE")
      || editSupervisorId !== (meQuery.data.supervisor?.id ?? "")
      || editCompensationType !== (meQuery.data.compensationType ?? "HOURLY")
      || editHourlyRate !== (meQuery.data.hourlyRate != null ? String(meQuery.data.hourlyRate) : "")
      || editDailyRate !== (meQuery.data.dailyRate != null ? String(meQuery.data.dailyRate) : "")
      || editDaysPerWeek !== (meQuery.data.daysPerWeek != null ? String(meQuery.data.daysPerWeek) : "5")
      || editRoleKey !== (meQuery.data.roles[0]?.role.key ?? "EMPLOYEE")
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
                    readOnly={isViewingOther && !canEditOtherProfile}
                  />
                  <ProfessionalDetailsCard
                    me={meQuery.data}
                    isEditing={isViewingOther ? canEditOtherProfile : false}
                    departments={departments ?? []}
                    supervisors={supervisors}
                    selectedDepartmentId={editDepartmentId}
                    selectedEmploymentType={editEmploymentType}
                    selectedSupervisorId={editSupervisorId}
                    selectedCompensationType={editCompensationType}
                    selectedHourlyRate={editHourlyRate}
                    selectedDailyRate={editDailyRate}
                    selectedDaysPerWeek={editDaysPerWeek}
                    selectedRoleKey={editRoleKey}
                    canEditRate={isAdminOrFinance}
                    onDepartmentChange={setEditDepartmentId}
                    onEmploymentTypeChange={setEditEmploymentType}
                    onSupervisorChange={setEditSupervisorId}
                    onCompensationTypeChange={setEditCompensationType}
                    onHourlyRateChange={setEditHourlyRate}
                    onDailyRateChange={setEditDailyRate}
                    onDaysPerWeekChange={setEditDaysPerWeek}
                    onRoleChange={setEditRoleKey}
                  />
                </div>
                {isViewingOther ? null : <SecuritySection me={meQuery.data} onToast={setToast} />}
              </div>
            )}
          </div>

          {meQuery.data ? (
            <div className="flex items-center justify-end gap-3 border-t border-[#c3c6d2]/50 px-6 py-4">
              <Button type="button" variant="outline" onClick={close}>
                {isViewingOther && !canEditOtherProfile && !isAdminOrFinance ? "Close" : "Cancel"}
              </Button>
              {/* Nothing is editable for a viewer who is neither Admin nor
                  Finance looking at someone else's profile (e.g. Supervisor) —
                  read-only, so there's nothing to save. */}
              {!isViewingOther || canEditOtherProfile || isAdminOrFinance ? (
                <Button
                  type="button"
                  onClick={handleSubmit((values) => saveProfile.mutate(values))}
                  disabled={saveProfile.isPending}
                >
                  {saveProfile.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  Save Changes
                </Button>
              ) : null}
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
