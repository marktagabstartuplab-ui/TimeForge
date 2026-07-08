import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-lg",
} as const;

const STATUS_COLORS = {
  active: "bg-green-500",
  break: "bg-amber-500",
  offline: "bg-[#c3c6d2]",
} as const;

export type AvatarStatus = keyof typeof STATUS_COLORS;

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

interface AvatarProps {
  firstName: string;
  lastName: string;
  imageUrl?: string | null;
  size?: keyof typeof SIZES;
  status?: AvatarStatus;
  className?: string;
}

/** Circular avatar: image when available, initials fallback, optional status dot. */
export function Avatar({ firstName, lastName, imageUrl, size = "md", status, className }: AvatarProps) {
  return (
    <div className={cn("relative shrink-0", SIZES[size], className)}>
      <div className="h-full w-full overflow-hidden rounded-full bg-brand-navy font-semibold text-white">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {initials(firstName, lastName)}
          </div>
        )}
      </div>
      {status ? (
        <span
          className={cn(
            "absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full border-2 border-white",
            STATUS_COLORS[status],
          )}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
