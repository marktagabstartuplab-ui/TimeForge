import { AuthTopBar } from "./AuthTopBar";
import { AuthFooter } from "./AuthFooter";

interface AuthCenteredLayoutProps {
  children: React.ReactNode;
  topCenter?: React.ReactNode;
  topRight?: React.ReactNode;
  /** Extra content rendered under the card (e.g. the login trust row). */
  belowCard?: React.ReactNode;
  /** Optional decorative background layer (e.g. login gradient blobs). */
  decor?: React.ReactNode;
}

export function AuthCenteredLayout({
  children,
  topCenter,
  topRight,
  belowCard,
  decor,
}: AuthCenteredLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f2f2f2]">
      <AuthTopBar center={topCenter} right={topRight} />
      <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-12">
        {decor ? <div className="pointer-events-none absolute inset-0">{decor}</div> : null}
        <div className="relative z-10 w-full max-w-[420px]">{children}</div>
        {belowCard ? <div className="relative z-10 mt-8 w-full max-w-[420px]">{belowCard}</div> : null}
      </main>
      <AuthFooter />
    </div>
  );
}
