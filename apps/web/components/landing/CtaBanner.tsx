import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CtaBanner() {
  return (
    <section className="bg-blue-600 px-4 py-20 text-center sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-3xl font-extrabold text-white">Ready to get started?</h2>
        <p className="mt-3 text-base text-blue-100">
          Join thousands of companies already using TimeForge to optimize their workforce operations.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            render={<Link href="/register" />}
            nativeButton={false}
            className="h-11 w-full bg-white px-6 text-base text-blue-600 hover:bg-blue-50 sm:w-auto"
          >
            Create your account
          </Button>
          <Button
            render={<Link href="/login" />}
            nativeButton={false}
            variant="outline"
            className="h-11 w-full border-white/40 bg-transparent px-6 text-base text-white hover:bg-white/10 sm:w-auto"
          >
            Sign In
          </Button>
        </div>
      </div>
    </section>
  );
}
