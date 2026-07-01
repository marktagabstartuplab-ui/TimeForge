import { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-brand-navy">
      {children}
    </Label>
  );
}

interface IconInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  invalid?: boolean;
}

/**
 * Text input matching the Figma auth fields: rounded, hairline border, focus
 * ring in brand blue, and an optional leading icon in a boxed inset.
 */
export const IconInput = forwardRef<HTMLInputElement, IconInputProps>(
  ({ icon: Icon, invalid, className, ...props }, ref) => {
    return (
      <div className="relative">
        {Icon ? (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-brand-muted/70">
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
        ) : null}
        <input
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-11 w-full rounded-[10px] border bg-white text-[15px] text-brand-ink transition-colors",
            "placeholder:text-brand-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:border-brand",
            "disabled:cursor-not-allowed disabled:bg-[#f6f3f4] disabled:text-brand-muted/70",
            Icon ? "pl-11 pr-3.5" : "px-3.5",
            invalid ? "border-red-400 focus-visible:ring-red-200 focus-visible:border-red-400" : "border-[#c3c6d2]",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
IconInput.displayName = "IconInput";
