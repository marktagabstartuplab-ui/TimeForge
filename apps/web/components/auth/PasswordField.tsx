"use client";

import { useState, forwardRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PasswordFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ className, error, id, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={Boolean(error)}
          className={cn("pr-10", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-r-md"
          aria-label={visible ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordField.displayName = "PasswordField";
