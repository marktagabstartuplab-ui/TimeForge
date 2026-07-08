"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Camera,
  Loader2,
  KeyRound,
  Bell,
  Shield,
  ChevronRight,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Calendar,
  Hash,
  Building2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ApiError } from "@/lib/api/client";
import { profileSchema, type ProfileValues } from "@/features/account/schemas/account.schema";
import {
  getMe,
  updateProfile,
  uploadAvatar,
  type Me,
} from "@/features/account/api/account.service";
import { ChangePasswordDialog } from "@/features/account/components/ChangePasswordDialog";

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function employeeCode(id: string) {
  return `TF-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const EMPLOYMENT_LABELS: Record<string, string> = {
  EMPLOYEE: "Employee",
  INTERN: "Intern",
  CONTRACTOR: "Contractor",
  PART_TIME: "Part-time",
  FULL_TIME: "Full-time",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-100 text-red-700",
  SUPERVISOR: "bg-violet-100 text-violet-700",
  HR: "bg-sky-100 text-sky-700",
  FINANCE: "bg-emerald-100 text-emerald-700",
  EMPLOYEE: "bg-brand-cyan/15 text-brand",
};

// ─── Avatar widget ───────────────────────────────────────────────────────────

function AvatarWidget({ me, onToast }: { me: Me; onToast: (t: ToastState) => void }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (updated) => {
      queryClient.setQueryData(["account", "me"], updated);
      setPreview(null);
      onToast({ message: "Photo updated.", tone: "success" });
    },
    onError: (err) => {
      setPreview(null);
      onToast({ message: err instanceof ApiError ? err.message : "Upload failed", tone: "error" });
    },
  });

  const src = preview ?? me.avatarUrl;

  return (
    <div className="relative mx-auto h-24 w-24">
      <div className="h-24 w-24 overflow-hidden rounded-full ring-4 ring-white shadow-lg bg-gradient-to-br from-brand-cyan to-brand text-white text-2xl font-bold flex items-center justify-center">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span>{initials(me.firstName, me.lastName)}</span>
        )}
        {save.isPending && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={save.isPending}
        className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white shadow-md hover:bg-brand/90 transition-colors"
        aria-label="Upload photo"
      >
        <Camera className="h-4 w-4" />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setPreview(URL.createObjectURL(file));
          save.mutate(file);
        }}
      />
    </div>
  );
}

// ─── Info row (display) ──────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#f6f3f4]">
        <Icon className="h-4 w-4 text-brand-muted" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted/70">{label}</p>
        <p className="text-sm font-medium text-brand-navy truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

// ─── Detail chip (employment grid) ──────────────────────────────────────────

function DetailChip({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-[10px] border border-[#c3c6d2]/50 bg-[#fafafa] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted/70 mb-1">{label}</p>
      <p className="text-sm font-semibold text-brand-navy">{value || "—"}</p>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function MyProfileContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const { data: me, isLoading, isError, refetch } = useQuery({
    queryKey: ["account", "me"],
    queryFn: getMe,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
  });

  function startEdit() {
    if (!me) return;
    reset({ firstName: me.firstName, lastName: me.lastName, phone: me.phone ?? "" });
    setIsEditing(true);
  }

  const save = useMutation({
    mutationFn: (values: ProfileValues) =>
      updateProfile({ ...values, phone: values.phone || undefined }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["account", "me"], updated);
      setIsEditing(false);
      setToast({ message: "Profile saved.", tone: "success" });
    },
    onError: (err) => {
      setToast({ message: err instanceof ApiError ? err.message : "Save failed", tone: "error" });
    },
  });

  // ── Skeleton ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-[#e4e2e3]" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 h-96 rounded-2xl bg-[#e4e2e3]" />
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="h-48 rounded-2xl bg-[#e4e2e3]" />
            <div className="h-48 rounded-2xl bg-[#e4e2e3]" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !me) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <p className="text-brand-navy font-semibold">Could not load your profile.</p>
        <Button variant="outline" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  const primaryRole = me.roles[0]?.role;
  const roleLabel = primaryRole?.name ?? "Member";
  const roleKey = primaryRole?.key ?? "EMPLOYEE";

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} onToast={setToast} />

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-brand-navy">My Profile</h1>
        <p className="text-sm text-brand-muted">Manage your personal information and account settings.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ── Left column ──────────────────────────────────────────────────── */}
        <div className="lg:col-span-4 flex flex-col gap-4">

          {/* Profile card */}
          <div className="rounded-2xl border border-[#c3c6d2]/40 bg-white p-6 shadow-sm flex flex-col items-center gap-4">
            <AvatarWidget me={me} onToast={setToast} />

            <div className="text-center">
              <p className="text-lg font-bold text-brand-navy">
                {me.firstName} {me.lastName}
              </p>
              <p className="text-sm text-brand-muted mt-0.5">{me.jobTitle || me.organization.name}</p>
              <span
                className={`mt-2 inline-block rounded-full px-3 py-0.5 text-[11px] font-bold tracking-wide ${ROLE_COLORS[roleKey] ?? ROLE_COLORS.EMPLOYEE}`}
              >
                {roleLabel}
              </span>
            </div>

            {isEditing ? (
              <div className="w-full flex flex-col gap-3">
                <div>
                  <Label htmlFor="firstName" className="mb-1 text-xs">First Name</Label>
                  <Input id="firstName" {...register("firstName")} aria-invalid={Boolean(errors.firstName)} />
                  {errors.firstName && <p className="mt-1 text-[11px] text-red-500">{errors.firstName.message}</p>}
                </div>
                <div>
                  <Label htmlFor="lastName" className="mb-1 text-xs">Last Name</Label>
                  <Input id="lastName" {...register("lastName")} aria-invalid={Boolean(errors.lastName)} />
                  {errors.lastName && <p className="mt-1 text-[11px] text-red-500">{errors.lastName.message}</p>}
                </div>
                <div>
                  <Label htmlFor="phone" className="mb-1 text-xs">Phone</Label>
                  <Input id="phone" {...register("phone")} aria-invalid={Boolean(errors.phone)} />
                  {errors.phone && <p className="mt-1 text-[11px] text-red-500">{errors.phone.message}</p>}
                </div>
                <div className="flex gap-2 mt-1">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={handleSubmit((v) => save.mutate(v))}
                    disabled={save.isPending || !isDirty}
                  >
                    {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIsEditing(false)}
                    disabled={save.isPending}
                  >
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="w-full" onClick={startEdit}>
                <Pencil className="h-4 w-4" />
                Edit Profile
              </Button>
            )}
          </div>

          {/* Account Settings card */}
          <div className="rounded-2xl border border-[#c3c6d2]/40 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-brand-muted/70 mb-3">
              Account Settings
            </p>
            <div className="flex flex-col divide-y divide-[#c3c6d2]/30">
              {[
                { icon: KeyRound, label: "Change Password", onClick: () => setPasswordOpen(true) },
                {
                  icon: Bell,
                  label: "Notification Preferences",
                  onClick: () => setToast({ message: "Notification preferences coming soon.", tone: "info" }),
                },
                {
                  icon: Shield,
                  label: "Privacy Settings",
                  onClick: () => setToast({ message: "Privacy settings coming soon.", tone: "info" }),
                },
              ].map(({ icon: Icon, label, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  className="flex items-center justify-between gap-3 py-3 text-sm font-medium text-brand-navy hover:text-brand transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-brand-muted group-hover:text-brand transition-colors" />
                    {label}
                  </div>
                  <ChevronRight className="h-4 w-4 text-brand-muted/50" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-8 flex flex-col gap-6">

          {/* Personal Information */}
          <div className="rounded-2xl border border-[#c3c6d2]/40 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-brand-navy">Personal Information</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <InfoRow icon={User} label="Full Name" value={`${me.firstName} ${me.lastName}`} />
              <InfoRow icon={Mail} label="Email Address" value={me.email} />
              <InfoRow icon={Phone} label="Phone Number" value={me.phone} />
              <InfoRow icon={MapPin} label="Address" value={null} />
            </div>
          </div>

          {/* Employment / Supervisor Details */}
          <div className="rounded-2xl border border-[#c3c6d2]/40 bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-brand-navy mb-5">
              {me.roles.some((r) => ["SUPERVISOR", "ADMIN", "HR"].includes(r.role.key))
                ? "Supervisor Details"
                : "Employment Details"}
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <DetailChip label="Employee ID" value={employeeCode(me.id)} />
              <DetailChip label="Joining Date" value={formatDate(me.createdAt)} />
              <DetailChip
                label="Employment Type"
                value={EMPLOYMENT_LABELS[me.employmentType] ?? me.employmentType}
              />
              <DetailChip label="Department" value={me.department?.name} />
            </div>

            {/* Supervisor card */}
            {me.supervisor ? (
              <div className="mt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted/70 mb-2">
                  {roleKey === "ADMIN" ? "Admin" : "Supervisor"}
                </p>
                <div className="flex items-center gap-3 rounded-[10px] border border-[#c3c6d2]/50 bg-[#fafafa] px-4 py-3">
                  <div className="h-9 w-9 overflow-hidden rounded-full bg-gradient-to-br from-brand-cyan to-brand text-white text-sm font-bold flex items-center justify-center shrink-0">
                    {me.supervisor.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={me.supervisor.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initials(me.supervisor.firstName, me.supervisor.lastName)
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-brand-navy">
                      {me.supervisor.firstName} {me.supervisor.lastName}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-[10px] border border-dashed border-[#c3c6d2]/50 bg-[#fafafa] px-4 py-3">
                <Building2 className="h-4 w-4 text-brand-muted" />
                <p className="text-sm text-brand-muted">No supervisor assigned</p>
              </div>
            )}

            {/* Additional fields row */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <InfoRow icon={Briefcase} label="Job Title" value={me.jobTitle} />
              <InfoRow icon={Hash} label="Organization" value={me.organization.name} />
              <InfoRow icon={Calendar} label="Status" value={me.status} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
