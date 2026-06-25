"use client";

// Tabs — accessible tablist used for the tenant offer's three channels (email / portal / text)
// and any other channel-style switching. Client component (selection state). Implements the WAI-ARIA
// tabs keyboard pattern: roving tabindex + Arrow/Home/End move and focus the selected tab.

import { useId, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export function Tabs({
  tabs,
  initialId,
  ariaLabel,
}: Readonly<{ tabs: readonly TabItem[]; initialId?: string; ariaLabel?: string }>) {
  const [active, setActive] = useState(initialId ?? tabs[0]?.id);
  const baseId = useId();
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab?.id);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    setActive(tabs[nextIndex].id);
    // The tablist's direct children are the tab buttons in order.
    const button = event.currentTarget.children[nextIndex] as HTMLElement | undefined;
    button?.focus();
  }

  return (
    <div className="ui-tabs">
      <div
        aria-label={ariaLabel}
        className="ui-tablist"
        onKeyDown={onKeyDown}
        role="tablist"
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeTab?.id;
          return (
            <button
              aria-controls={`${baseId}-${tab.id}-panel`}
              aria-selected={selected}
              className="ui-tab"
              id={`${baseId}-${tab.id}-tab`}
              key={tab.id}
              onClick={() => setActive(tab.id)}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeTab ? (
        <div
          aria-labelledby={`${baseId}-${activeTab.id}-tab`}
          className="ui-tabpanel"
          id={`${baseId}-${activeTab.id}-panel`}
          role="tabpanel"
          tabIndex={0}
        >
          {activeTab.content}
        </div>
      ) : null}
    </div>
  );
}
