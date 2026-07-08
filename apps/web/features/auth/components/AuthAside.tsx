import { CalendarDays, Clock, Users, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

interface Feature {
  icon: LucideIcon;
  title: string;
}

// Per the Figma, "Role-based Access" and "Analytics & Reports" share the
// same two-person glyph.
const FEATURES: Feature[] = [
  { icon: Clock, title: "Time Tracking & Daily Work" },
  { icon: CalendarDays, title: "Scheduling" },
  { icon: Users, title: "Role-based Access" },
  { icon: Users, title: "Analytics & Reports" },
];

/**
 * Marketing aside shared by the login (landing) page and the register
 * wizard: large brand lockup, one-line pitch, and the four feature rows.
 */
export function AuthAside() {
  return (
    <div className="hidden lg:block">
      <Logo size="lg" href="" />
      <p className="text-body-lg mt-5 max-w-md text-brand-muted">
        TimeForge unifies time tracking, scheduling, analytics, daily work, finance into a single
        platform.
      </p>
      <ul className="mt-8 space-y-4">
        {FEATURES.map((f) => (
          <li key={f.title} className="flex items-center gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <f.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-h4 text-brand-ink">{f.title}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
