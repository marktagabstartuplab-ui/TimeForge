import Link from "next/link";

export function CtaBanner() {
  return (
    <section className="bg-brand px-4 py-20 text-center sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-3xl font-extrabold text-white">Ready to get started?</h2>
        <p className="mt-3 text-base text-blue-100">
          Sign in to your TimeForge workspace to track time, manage schedules, and see your
          team&apos;s workforce analytics.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="flex h-11 w-full items-center justify-center rounded-[10px] bg-white px-8 text-base font-bold text-brand transition-colors hover:bg-blue-50 sm:w-auto"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="flex h-11 w-full items-center justify-center rounded-[10px] border-2 border-white px-8 text-base font-bold text-white transition-colors hover:bg-white/10 sm:w-auto"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
