"use client";

import { useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import type { ScrumTask } from "@/features/scrum/api/scrum.service";
import type { DaySummary } from "@/features/time-tracking/lib/day-summary";
import {
  TabNavigation,
  type ScrumTabDescriptor,
  type ScrumTabId,
} from "@/features/time-tracking/components/scrum-tabs/TabNavigation";
import { ScrumProgressBar } from "@/features/time-tracking/components/scrum-tabs/ScrumProgressBar";
import { ReviewTab } from "@/features/time-tracking/components/scrum-tabs/ReviewTab";
import { SubmitTab } from "@/features/time-tracking/components/scrum-tabs/SubmitTab";

const TAB_ORDER: ScrumTabId[] = ["plan", "work", "review", "submit"];

/** Viewport widths from the FEAT-6 checklist. */
const VIEWPORTS = [
  { label: "Mobile — 375px", width: 375, height: 720 },
  { label: "Tablet — 768px", width: 768, height: 720 },
  { label: "Desktop — 1280px", width: 1280, height: 720 },
];

const SUMMARY: DaySummary = {
  trackedMinutes: 525,
  breakMinutes: 45,
  breakCount: 2,
  entryCount: 3,
  running: null,
  clockInAt: "2026-08-04T00:00:00.000Z",
  clockOutAt: "2026-08-04T09:45:00.000Z",
};

function task(partial: Partial<ScrumTask> & Pick<ScrumTask, "id" | "title">): ScrumTask {
  return {
    scrumEntryId: "preview-entry",
    employeeId: "preview-user",
    description: null,
    expectedOutput: "",
    measurement: "",
    projectId: null,
    taskStatus: "PENDING",
    completedAt: null,
    estimatedHours: null,
    actualHours: null,
    priority: "MEDIUM",
    kpi: null,
    plannedTarget: null,
    actualCompleted: null,
    continueTomorrow: null,
    notCompletedReason: null,
    kpiTemplateId: null,
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    version: 1,
    ...partial,
  };
}

const COMMITMENTS: ScrumTask[] = [
  task({
    id: "t1",
    title: "API integration",
    expectedOutput: "Endpoints wired to the tracker",
    kpi: "Endpoints shipped",
    plannedTarget: "3",
    actualCompleted: "3",
    taskStatus: "COMPLETED",
  }),
  task({
    id: "t2",
    title: "Code review for PR #234",
    expectedOutput: "Review comments posted",
    taskStatus: "COMPLETED",
  }),
  task({
    id: "t3",
    title: "Documentation pass on the payroll module",
    expectedOutput: "Runbook updated",
    kpi: "Pages",
    plannedTarget: "4",
    actualCompleted: "2",
    taskStatus: "IN_PROGRESS",
  }),
];

const CHECKLIST = [
  { label: "Planned today's commitments", done: true },
  { label: "Logged 3 work sessions", done: true },
  { label: "Saved your work details", done: true },
  { label: "Completed the end of day review", done: false },
];

/** Placeholder for the two steps built entirely from pre-existing cards. */
function PanelStub({ title, contents }: { title: string; contents: string[] }) {
  return (
    <section className="rounded-[12px] border border-dashed border-[#c3c6d2] bg-white p-4 sm:p-5">
      <h2 className="text-base font-bold text-brand-ink">{title}</h2>
      <p className="mt-1 text-sm text-brand-muted">
        Rendered from existing cards, which need live data — shown here as a list:
      </p>
      <ul className="mt-3 list-disc pl-5 text-sm text-brand-navy">
        {contents.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

/** The harness itself — chrome plus one panel, exactly as the real page composes them. */
function Harness() {
  const [active, setActive] = useState<ScrumTabId>("plan");

  // Fixture statuses: first two steps finished, review outstanding, submit gated.
  const base: ScrumTabDescriptor[] = [
    { id: "plan", shortLabel: "1. Plan", label: "Plan your day", status: "done" },
    { id: "work", shortLabel: "2. Work", label: "Log your work", status: "done" },
    { id: "review", shortLabel: "3. Review", label: "End of day review", status: "pending" },
    { id: "submit", shortLabel: "4. Submit", label: "Submit for approval", status: "locked" },
  ];
  const tabs = base.map((tab) =>
    tab.id === active && tab.status === "pending" ? { ...tab, status: "current" as const } : tab,
  );

  const activeIndex = TAB_ORDER.indexOf(active);

  return (
    <div className="flex flex-col gap-4 p-4">
      <ScrumProgressBar completed={2} total={4} />
      <TabNavigation tabs={tabs} active={active} onSelect={setActive} />

      <div hidden={active !== "plan"}>
        <PanelStub
          title="Plan your day"
          contents={["Daily Scrum planner (ScrumTaskCard)", "Quick Select rail — recent + carried-over commitments"]}
        />
      </div>
      <div hidden={active !== "work"}>
        <PanelStub
          title="Log your work"
          contents={["Current Session card (timer)", "Work Details", "Today's entries", "Today's Progress chart"]}
        />
      </div>
      <div hidden={active !== "review"}>
        <ReviewTab
          summary={SUMMARY}
          commitments={COMMITMENTS}
          onOpenReview={() => {}}
          reviewReady
          reviewBlockedReason={null}
          alreadyReviewed={false}
        />
      </div>
      <div hidden={active !== "submit"}>
        <SubmitTab
          checklist={CHECKLIST}
          onOpenReview={() => {}}
          reviewReady
          reviewBlockedReason={null}
          alreadyReviewed={false}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setActive(TAB_ORDER[activeIndex - 1])}
          disabled={activeIndex === 0}
          className="flex h-11 items-center gap-2 rounded-[10px] border border-[#c3c6d2]/60 bg-white px-5 text-sm font-bold text-brand-navy disabled:opacity-40"
        >
          <ArrowLeftIcon className="h-[18px] w-[18px]" aria-hidden="true" />
          Back
        </button>
        <button
          type="button"
          onClick={() => setActive(TAB_ORDER[activeIndex + 1])}
          disabled={activeIndex === TAB_ORDER.length - 1}
          className="flex h-11 items-center gap-2 rounded-[10px] bg-brand px-5 text-sm font-bold text-white disabled:opacity-40"
        >
          Next
          <ArrowRightIcon className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function ScrumTabsPreview({ bare }: { bare: boolean }) {
  if (bare) return <Harness />;

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-brand-ink">Daily Scrum tabs — preview</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Dev-only harness (FEAT-6). Each frame is the real tab chrome at a checklist viewport
          width; click through the four steps in any of them. Plan and Work panels are stubbed —
          their cards need live data.
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        {VIEWPORTS.map((vp) => (
          <figure key={vp.width} className="flex flex-col gap-2">
            <figcaption className="text-xs font-bold uppercase tracking-[1px] text-brand-muted">
              {vp.label}
            </figcaption>
            <iframe
              title={vp.label}
              src="/preview/scrum-tabs?bare=1"
              width={vp.width}
              height={vp.height}
              className="rounded-[12px] border border-[#c3c6d2] bg-[#f6f3f4]"
            />
          </figure>
        ))}
      </div>
    </main>
  );
}
