import { cn } from "@/lib/utils";

interface SubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
}

export function SubmitButton({
  loading,
  loadingText,
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
        "flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-brand text-[15px] font-bold text-white transition-colors",
        "hover:bg-[#1467d6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {loading ? (loadingText ?? "Please wait…") : children}
    </button>
  );
}
