import { BadgeCheck, Rocket, ShieldCheck, BarChart3, KeyRound, Network, type LucideIcon } from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

function FeatureList({ features }: { features: Feature[] }) {
  return (
    <ul className="mt-8 space-y-5">
      {features.map((f) => (
        <li key={f.title} className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e5f3ff] text-brand">
            <f.icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-brand-navy">{f.title}</p>
            <p className="text-sm text-brand-muted">{f.description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Step1Aside() {
  return (
    <div>
      <h2 className="text-[40px] font-bold leading-[1.1] tracking-[-1px] text-brand-navy">
        Master your time with{" "}
        <span className="mt-1 inline-block rounded-md bg-brand px-2 py-0.5 text-white">Precision.</span>
      </h2>
      <p className="mt-5 max-w-md text-[15px] leading-relaxed text-brand-muted">
        Join over 2,400+ modern teams who use TimeForge to unify tracking, scheduling, and HR
        analytics into a single high-performance platform.
      </p>
      <FeatureList
        features={[
          {
            icon: Rocket,
            title: "Rapid Deployment",
            description: "Set up your entire department in less than 5 minutes.",
          },
          {
            icon: ShieldCheck,
            title: "Enterprise Security",
            description: "SSO, 256-bit encryption, and role-based access control.",
          },
          {
            icon: BarChart3,
            title: "Advanced Analytics",
            description: "Real-time insights into workforce productivity and trends.",
          },
        ]}
      />
      <div className="mt-8 aspect-[16/10] w-full max-w-md rounded-2xl bg-gradient-to-br from-[#00465e] via-[#0a6d8a] to-[#48c8fe]/70 shadow-lg" />
    </div>
  );
}

export function Step2Aside() {
  return (
    <div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e4f5ea] px-3 py-1 text-xs font-semibold text-[#16a34a]">
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Invitation Verified
      </span>
      <h2 className="mt-4 text-[40px] font-bold leading-[1.1] tracking-[-1px] text-brand-navy">
        Finalize your secure workspace access.
      </h2>
      <p className="mt-5 max-w-md text-[15px] leading-relaxed text-brand-muted">
        You&apos;re just one step away from joining your team on TimeForge. Complete your profile
        details to get started.
      </p>
      <FeatureList
        features={[
          {
            icon: KeyRound,
            title: "Secure Credentials",
            description: "Industry-standard encryption for all passwords.",
          },
          {
            icon: Network,
            title: "Role Assignment",
            description: "Your role determines your workspace permissions.",
          },
        ]}
      />
    </div>
  );
}
