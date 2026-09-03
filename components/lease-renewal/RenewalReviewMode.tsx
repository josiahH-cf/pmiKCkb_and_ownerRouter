"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { RenewalDecider } from "@/components/lease-renewal/RenewalDecider";
import { liveRenewalReviewItemId } from "@/lib/lease-renewal/live-review-destination";
import type { RenewalRunView } from "@/lib/lease-renewal/run-view";

type ReviewMode = "decider" | "all";

const PHONE_QUERY = "(max-width: 720px)";

function subscribeToPhoneViewport(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener?.("change", onChange);
  return () => media.removeEventListener?.("change", onChange);
}

function phoneViewportSnapshot(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(PHONE_QUERY).matches
  );
}

function exactLinkedItemId(view: RenewalRunView): string | null {
  if (typeof window === "undefined") return null;
  const fragment = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";
  if (fragment === "") return null;
  for (const group of view.groups) {
    for (const flag of group.flags) {
      const itemId = liveRenewalReviewItemId(flag.sourceTriggerKey);
      if (itemId === fragment) return itemId;
    }
  }
  return null;
}

/**
 * Adds the phone-first one-card decider without retiring the established desktop list and bulk bar.
 * Server rendering starts on the stable all-items view; a narrow viewport switches to the decider
 * after hydration. The operator can always switch modes with ordinary buttons.
 */
export function RenewalReviewMode({
  view,
  canResolve,
  canDefer,
  isAdmin,
  children,
}: Readonly<{
  view: RenewalRunView;
  canResolve: boolean;
  canDefer: boolean;
  isAdmin: boolean;
  children: ReactNode;
}>) {
  const phoneViewport = useSyncExternalStore(
    subscribeToPhoneViewport,
    phoneViewportSnapshot,
    () => false,
  );
  const [selectedMode, setSelectedMode] = useState<ReviewMode | null>(null);
  const [linkedItemId, setLinkedItemId] = useState<string | null>(null);
  const mode = selectedMode ?? (phoneViewport ? "decider" : "all");

  useEffect(() => {
    function selectExactLinkedItem() {
      const itemId = exactLinkedItemId(view);
      setLinkedItemId(itemId);
      if (itemId) setSelectedMode("all");
    }

    selectExactLinkedItem();
    window.addEventListener("hashchange", selectExactLinkedItem);
    return () => window.removeEventListener("hashchange", selectExactLinkedItem);
  }, [view]);

  useEffect(() => {
    if (mode !== "all" || !linkedItemId) return;
    document.getElementById(linkedItemId)?.focus();
  }, [linkedItemId, mode]);

  return (
    <div className="lr-review-mode">
      <div
        aria-label="Renewal review mode"
        className="lr-review-mode-switch"
        role="group"
      >
        <button
          aria-pressed={mode === "decider"}
          className={mode === "decider" ? "" : "secondary-button"}
          onClick={() => setSelectedMode("decider")}
          type="button"
        >
          Decide one at a time
        </button>
        <button
          aria-pressed={mode === "all"}
          className={mode === "all" ? "" : "secondary-button"}
          onClick={() => setSelectedMode("all")}
          type="button"
        >
          View all flags
        </button>
      </div>

      {mode === "decider" ? (
        <RenewalDecider
          canDefer={canDefer}
          canResolve={canResolve}
          isAdmin={isAdmin}
          view={view}
        />
      ) : (
        children
      )}
    </div>
  );
}
