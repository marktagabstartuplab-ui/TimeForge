"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormBanner } from "@/features/auth/components/FormMessages";
import { ApiError } from "@/lib/api/client";
import { changePasswordSchema, type ChangePasswordValues } from "../schemas/account.schema";
import { changePassword } from "../api/account.service";
import type { ToastState } from "@/components/shared/Toast";

export function ChangePasswordDialog({
  open,
  onOpenChange,
  onToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToast: (t: ToastState) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const submit = useMutation({
    mutationFn: (values: ChangePasswordValues) =>
      changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
    onSuccess: () => {
      onToast({ message: "Password changed.", tone: "success" });
      reset();
      onOpenChange(false);
    },
    onError: (err) => {
      setServerError(err instanceof ApiError ? err.message : "Something went wrong");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          setServerError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Choose a new password for your account.</DialogDescription>
          </div>
          <DialogCloseButton />
        </div>
        <form
          onSubmit={handleSubmit((values) => submit.mutate(values))}
          noValidate
          className="flex flex-col gap-4 px-6 py-5"
        >
          {serverError ? <FormBanner message={serverError} /> : null}

          <div>
            <Label htmlFor="currentPassword" className="mb-1.5">Current Password</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.currentPassword)}
              {...register("currentPassword")}
            />
            <FieldError message={errors.currentPassword?.message} />
          </div>

          <div>
            <Label htmlFor="newPassword" className="mb-1.5">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.newPassword)}
              {...register("newPassword")}
            />
            <FieldError message={errors.newPassword?.message} />
          </div>

          <div>
            <Label htmlFor="confirmPassword" className="mb-1.5">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register("confirmPassword")}
            />
            <FieldError message={errors.confirmPassword?.message} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Update Password
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
