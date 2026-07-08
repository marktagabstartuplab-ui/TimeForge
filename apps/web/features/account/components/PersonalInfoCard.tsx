"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2 } from "lucide-react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { SectionCard } from "@/components/shared/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/features/auth/components/FormMessages";
import { ApiError } from "@/lib/api/client";
import type { ProfileValues } from "../schemas/account.schema";
import { uploadAvatar, type Me } from "../api/account.service";
import type { ToastState } from "@/components/shared/Toast";

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

interface PersonalInfoCardProps {
  me: Me;
  register: UseFormRegister<ProfileValues>;
  errors: FieldErrors<ProfileValues>;
  onToast: (t: ToastState) => void;
  /** false when an Admin is viewing another employee — there's no "upload someone else's avatar" capability. */
  allowAvatarUpload?: boolean;
}

/** Editable personal info fields (name/phone) + avatar upload. Full Name/Phone are registered into the parent form; avatar upload is its own immediate action. Email is read-only. */
export function PersonalInfoCard({ me, register, errors, onToast, allowAvatarUpload = true }: PersonalInfoCardProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const saveAvatar = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (updated) => {
      queryClient.setQueryData(["account", "me"], updated);
      setAvatarPreview(null);
      onToast({ message: "Photo updated.", tone: "success" });
    },
    onError: (err) => {
      setAvatarPreview(null);
      onToast({
        message: err instanceof ApiError ? err.message : "Failed to upload photo",
        tone: "error",
      });
    },
  });

  const onPickPhoto = () => fileInputRef.current?.click();

  const onPhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
    saveAvatar.mutate(file);
  };

  const avatarSrc = avatarPreview ?? me.avatarUrl;

  return (
    <SectionCard title="Personal Information">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-[#e4e2e3] text-lg font-semibold text-brand-navy">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              {initials(me.firstName, me.lastName)}
            </div>
          )}
          {saveAvatar.isPending ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
            </div>
          ) : null}
        </div>
        {allowAvatarUpload ? (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={onPickPhoto} disabled={saveAvatar.isPending}>
              <Camera aria-hidden="true" />
              Change Photo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onPhotoSelected}
            />
            <p className="mt-1.5 text-xs text-brand-muted">PNG, JPG or WEBP. Max 5MB.</p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="firstName" className="mb-1.5">Full Name</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input id="firstName" aria-invalid={Boolean(errors.firstName)} {...register("firstName")} />
              <FieldError message={errors.firstName?.message} />
            </div>
            <div>
              <Input id="lastName" aria-invalid={Boolean(errors.lastName)} {...register("lastName")} />
              <FieldError message={errors.lastName?.message} />
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="email" className="mb-1.5">Email Address</Label>
          <Input id="email" type="email" value={me.email} disabled readOnly />
        </div>

        <div>
          <Label htmlFor="phone" className="mb-1.5">Phone Number</Label>
          <Input id="phone" aria-invalid={Boolean(errors.phone)} {...register("phone")} />
          <FieldError message={errors.phone?.message} />
        </div>
      </div>
    </SectionCard>
  );
}
