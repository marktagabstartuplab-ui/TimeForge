"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col", className)} {...props} />;
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "flex min-w-0 max-w-full items-center gap-1 overflow-x-auto border-b border-[#c3c6d2]/50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium text-brand-muted outline-none transition-colors hover:text-brand-navy data-[selected]:text-brand data-[selected]:after:absolute data-[selected]:after:inset-x-0 data-[selected]:after:bottom-[-1px] data-[selected]:after:h-[2px] data-[selected]:after:rounded-full data-[selected]:after:bg-brand focus-visible:ring-2 focus-visible:ring-brand/40",
        className,
      )}
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-panel" className={cn("outline-none", className)} {...props} />;
}

export { Tabs, TabsList, TabsTab, TabsPanel };
