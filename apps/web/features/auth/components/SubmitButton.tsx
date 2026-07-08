import { cn } from "@/lib/utils";

interface SubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  /** "brand" (default, blue) or "dark" (navy/black, used on the sign-in hero card). */
  tone?: "brand" | "dark";
}

export function SubmitButton({
  loading,
  loadingText,
  tone = "brand",
  children,
  disabled,
  className,
  ...props
}: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className={cn(
        "text-body-lg flex h-11 w-full items-center justify-center gap-2 rounded-lg font-bold text-white transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        tone === "dark"
          ? "bg-brand-navy hover:bg-[#001c27] focus-visible:ring-brand-navy/40"
          : "bg-brand hover:bg-[#1467d6] focus-visible:ring-brand/40",
        className,
      )}
      {...props}
    >
      {loading ? (loadingText ?? "Please wait…") : children}
    </button>
  );
}
