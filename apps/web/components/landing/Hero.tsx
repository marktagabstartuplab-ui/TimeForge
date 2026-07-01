import Link from "next/link";
import { Zap, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const trustItems = ["No credit card required", "14-day free trial", "Cancel anytime"];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/60 via-white to-white px-4 py-24 text-center sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <span className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold tracking-wide text-blue-700">
          <Zap className="h-3 w-3" />
          WORKFORCE MANAGEMENT REIMAGINED
        </span>

        <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-5xl">
          Time tracking built
          <br />
          <span className="text-blue-600">for modern teams</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-gray-500">
          TimeForge unifies time tracking, scheduling, and HR analytics into a single platform —
          giving every role the tools they need to work smarter.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            render={<Link href="/register" />}
            nativeButton={false}
            className="h-11 w-full bg-blue-600 px-6 text-base hover:bg-blue-700 sm:w-auto"
          >
            Start free trial →
          </Button>
          <Button
            render={<Link href="/login" />}
            nativeButton={false}
            variant="outline"
            className="h-11 w-full border-gray-300 bg-white px-6 text-base sm:w-auto"
          >
            Sign in to your account
          </Button>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 text-sm text-gray-500 sm:flex-row sm:gap-6">
          {trustItems.map((item) => (
            <span key={item} className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
