import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  /** "row" for top bars (default); "stacked" for the app sidebar. */
  variant?: "row" | "stacked";
  href?: string;
  className?: string;
}

// The brand lockup is the "TimeForge" wordmark next to the StartupLab ·
// Business Center graphic (exported from Figma to /public/brand/startuplab.png).
export function Logo({ variant = "row", href = "/", className }: LogoProps) {
  const inner =
    variant === "stacked" ? (
      <span className="flex flex-col items-start gap-1">
        <span className="text-[20px] font-bold leading-[25px] tracking-[-0.5px] text-brand-navy">
          TimeForge
        </span>
        <Image
          src="/brand/startuplab.png"
          alt="StartupLab Business Center"
          width={150}
          height={55}
          priority
          className="h-[44px] w-auto"
        />
      </span>
    ) : (
      <span className="flex items-center gap-2">
        <span className="text-[19px] font-bold leading-none tracking-[-0.4px] text-brand-navy">
          TimeForge
        </span>
        <Image
          src="/brand/startuplab.png"
          alt="StartupLab Business Center"
          width={95}
          height={35}
          priority
          className="h-[30px] w-auto"
        />
      </span>
    );

  if (href) {
    return (
      <Link href={href} className={cn("inline-flex shrink-0 items-center", className)} aria-label="TimeForge home">
        {inner}
      </Link>
    );
  }
  return <span className={cn("inline-flex shrink-0 items-center", className)}>{inner}</span>;
}
