import { Clock, Calendar, BarChart3, Users, ShieldCheck, Globe, type LucideIcon } from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: Clock,
    title: "Precision Time Tracking",
    description: "Track employee hours with clock-in/out, overtime detection, and automated timesheets.",
  },
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description: "Build and manage shift schedules effortlessly with conflict detection and swap requests.",
  },
  {
    icon: BarChart3,
    title: "Analytics & Reports",
    description: "Generate powerful workforce reports with real-time insights across all departments.",
  },
  {
    icon: Users,
    title: "Role-Based Access",
    description: "Granular permissions for employees, supervisors, HR/Finance, and administrators.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise Security",
    description: "SOC 2 compliant with end-to-end encryption, SSO, and audit trails.",
  },
  {
    icon: Globe,
    title: "Multi-Location Support",
    description: "Manage distributed teams across departments, locations, and time zones.",
  },
];

export function FeatureGrid() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold text-brand-ink">Everything your workforce needs</h2>
          <p className="mt-3 text-base text-brand-muted">
            A complete suite of tools designed to streamline operations from the shop floor to the
            executive suite.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-gray-200 p-6 transition-shadow duration-200 hover:shadow-md"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <f.icon className="h-5 w-5 text-brand" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-brand-ink">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-brand-muted">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
