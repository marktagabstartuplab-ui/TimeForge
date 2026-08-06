import { AppShell } from "@/features/app-shell/components/AppShell";
import { HolidayCalendarContent } from "@/features/org-management/components/HolidayCalendarContent";

export const metadata = {
  title: "Holiday Calendar — TimeForge",
};

export default function HolidayCalendarPage() {
  return (
    <AppShell>
      <HolidayCalendarContent />
    </AppShell>
  );
}
