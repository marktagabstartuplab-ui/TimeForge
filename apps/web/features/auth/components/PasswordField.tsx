"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  invalid?: boolean;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ icon: Icon, invalid, className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        {Icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-brand-muted/70">
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        ) : null}
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-11 w-full rounded-[10px] border bg-white text-[15px] text-brand-ink transition-colors",
            "placeholder:text-brand-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:border-brand",
            "disabled:cursor-not-allowed disabled:bg-[#f6f3f4]",
            Icon ? "pl-11 pr-11" : "pl-3.5 pr-11",
            invalid ? "border-red-400 focus-visible:ring-red-200 focus-visible:border-red-400" : "border-[#c3c6d2]",
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[10px] text-brand-muted/70 transition-colors hover:text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {visible ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      </div>
    );
  },
);
PasswordField.displayName = "PasswordField";
