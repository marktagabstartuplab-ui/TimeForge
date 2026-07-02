import Link from "next/link";
import { Zap } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/60 via-white to-white px-4 py-24 text-center sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <span className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold tracking-wide text-brand">
          <Zap className="h-3 w-3" />
          WORKFORCE MANAGEMENT REIMAGINED
        </span>

        <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-brand-ink sm:text-5xl">
          Time tracking built
          <br />
          <span className="text-brand">for modern teams</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-muted">
          TimeForge unifies time tracking, scheduling, and HR analytics into a single platform —
          giving every role the tools they need to work smarter.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="flex h-11 w-full items-center justify-center rounded-[10px] bg-brand px-8 text-base font-bold text-white transition-colors hover:bg-[#1467d6] sm:w-auto"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="flex h-11 w-full items-center justify-center rounded-[10px] border-2 border-brand px-8 text-base font-bold text-brand transition-colors hover:bg-blue-50 sm:w-auto"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
