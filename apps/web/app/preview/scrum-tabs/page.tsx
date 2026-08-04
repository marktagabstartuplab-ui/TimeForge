import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScrumTabsPreview } from "./ScrumTabsPreview";

export const metadata: Metadata = { title: "Scrum tabs preview | HeroTime" };

/**
 * Dev-only visual harness for the Daily Scrum tabbed workflow (FEAT-6). It
 * renders the real TabNavigation / ScrumProgressBar / ReviewTab / SubmitTab
 * against fixture data so the layout can be reviewed without an authenticated
 * employee session or a running API.
 *
 * `?bare=1` renders the harness alone — the default view embeds that mode in
 * 375 / 768 / 1280px iframes, so Tailwind's viewport media queries actually
 * apply at each width.
 */
export default async function ScrumTabsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ bare?: string }>;
}) {
  // Never reachable in a deployed build.
  if (process.env.NODE_ENV === "production") notFound();

  const { bare } = await searchParams;
  return <ScrumTabsPreview bare={bare === "1"} />;
}
