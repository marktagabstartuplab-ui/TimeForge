import { AuthTopBar } from "./AuthTopBar";
import { AuthFooter } from "./AuthFooter";

interface AuthSplitLayoutProps {
  /** Brand/marketing panel (left on desktop, hidden on mobile). */
  aside: React.ReactNode;
  /** Form card (right on desktop). */
  children: React.ReactNode;
  topRight?: React.ReactNode;
}

export function AuthSplitLayout({ aside, children, topRight }: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f6f7f9]">
      <AuthTopBar right={topRight} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid w-full grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 lg:order-1">{aside}</div>
          <div className="order-1 mx-auto w-full max-w-[440px] lg:order-2">{children}</div>
        </div>
      </main>
      <AuthFooter />
    </div>
  );
}
