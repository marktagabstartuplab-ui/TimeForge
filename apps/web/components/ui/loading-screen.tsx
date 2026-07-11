/**
 * Loading state matching app/loading.tsx's route-level fallback — used wherever
 * a shell or guard is waiting on session/permission data instead of rendering
 * a blank screen. `fullHeight` (default) fills the viewport, for use before
 * the sidebar/top bar have mounted; pass `false` when embedding inside an
 * already-rendered shell's <main> (e.g. PermissionGuard's redirect window).
 */
export function LoadingScreen({ fullHeight = true }: { fullHeight?: boolean }) {
  return (
    <div className={`flex items-center justify-center bg-[#f2f2f2] ${fullHeight ? "h-screen" : "h-full min-h-[50vh]"}`}>
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    </div>
  );
}
