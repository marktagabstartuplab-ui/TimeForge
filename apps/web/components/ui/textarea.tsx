import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** Multi-line input matching the IconInput field styling. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ invalid, className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "min-h-[110px] w-full resize-y rounded-[10px] border bg-white px-3.5 py-2.5 text-[15px] text-brand-ink transition-colors",
          "placeholder:text-brand-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:border-brand",
          "disabled:cursor-not-allowed disabled:bg-[#f6f3f4] disabled:text-brand-muted/70",
          invalid ? "border-red-400 focus-visible:ring-red-200 focus-visible:border-red-400" : "border-[#c3c6d2]",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
