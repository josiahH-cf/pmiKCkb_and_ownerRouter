"use client";

// Tabs — accessible tablist used for the tenant offer's three channels (email / portal / text)
// and any other channel-style switching. Client component (selection state).

import { useId, useState } from "react";
import type { ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export function Tabs({
  tabs,
  initialId,
}: Readonly<{ tabs: readonly TabItem[]; initialId?: string }>) {
  const [active, setActive] = useState(initialId ?? tabs[0]?.id);
  const baseId = useId();
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <div className="ui-tabs">
      <div className="ui-tablist" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-controls={`${baseId}-${tab.id}-panel`}
            aria-selected={tab.id === activeTab?.id}
            className="ui-tab"
            id={`${baseId}-${tab.id}-tab`}
            key={tab.id}
            onClick={() => setActive(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab ? (
        <div
          aria-labelledby={`${baseId}-${activeTab.id}-tab`}
          className="ui-tabpanel"
          id={`${baseId}-${activeTab.id}-panel`}
          role="tabpanel"
        >
          {activeTab.content}
        </div>
      ) : null}
    </div>
  );
}
