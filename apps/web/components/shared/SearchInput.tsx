import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  className?: string;
}

/** Rounded search field with a leading icon — the shared search input used across the app. */
export function SearchInput({ className, ...props }: SearchInputProps) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted/50" aria-hidden="true" />
      <input
        type="search"
        className={cn(
          "h-9 w-full rounded-full bg-[#f6f3f4] pl-10 pr-4 text-sm text-brand-ink placeholder:text-brand-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
          className,
        )}
        {...props}
      />
    </div>
  );
}
