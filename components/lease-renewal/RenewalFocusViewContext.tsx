"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { focusRenewalDashboardControl } from "./RenewalDashboardNavigation";

/**
 * S143: the lease-level Full view / Focus view switch. The view, the chosen task and the saved
 * Full view scroll position are page-local presentation state: switching never saves, submits,
 * navigates, writes a preference or calls a provider. S152: a lease opens in Focus view; both
 * views support the same work and neither is an edit, review or locked mode.
 */

export type RenewalWorkspaceView = "full" | "focus";

interface FocusViewValue {
  readonly view: RenewalWorkspaceView;
  readonly setView: (view: RenewalWorkspaceView) => void;
  /** Return to Full view at one existing control instead of the saved scroll position. */
  readonly showInFull: (targetId: string | null) => void;
  readonly selectedActionId: string | null;
  readonly setSelectedActionId: (id: string | null) => void;
  readonly slot: HTMLElement | null;
  readonly setSlot: (element: HTMLElement | null) => void;
}

const FocusViewContext = createContext<FocusViewValue | null>(null);

export function useRenewalFocusView() {
  return useContext(FocusViewContext);
}

export function RenewalFocusViewProvider({
  children,
  initialView = "focus",
}: {
  children: ReactNode;
  /** S152: Focus unless the surface has no Focus view to show. */
  initialView?: RenewalWorkspaceView;
}) {
  const [view, setViewState] = useState<RenewalWorkspaceView>(initialView);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const current = useRef<RenewalWorkspaceView>(initialView);
  const scrollY = useRef<number | null>(null);
  const fullTarget = useRef<string | null>(null);
  const setView = useCallback((next: RenewalWorkspaceView) => {
    if (next === current.current) return;
    if (next === "focus") scrollY.current = window.scrollY;
    current.current = next;
    setViewState(next);
  }, []);
  const showInFull = useCallback(
    (targetId: string | null) => {
      fullTarget.current = targetId;
      setView("full");
    },
    [setView],
  );
  // Children clear the Focus reveal in their own layout effects first, so the Full view is whole
  // again before its scroll position or a requested control is restored here.
  useLayoutEffect(() => {
    if (view !== "full") return;
    const target = fullTarget.current;
    const y = scrollY.current;
    fullTarget.current = null;
    scrollY.current = null;
    if (target && focusRenewalDashboardControl(target, { viewRequest: false })) return;
    if (y !== null) window.scrollTo?.({ top: y });
  }, [view]);
  const value = useMemo(
    () => ({
      view,
      setView,
      showInFull,
      selectedActionId,
      setSelectedActionId,
      slot,
      setSlot,
    }),
    [view, setView, showInFull, selectedActionId, slot],
  );
  return <FocusViewContext.Provider value={value}>{children}</FocusViewContext.Provider>;
}

/** The accessible lease-level switch, rendered in the workspace toolbar in both views. */
export function RenewalFocusViewSwitch() {
  const context = useRenewalFocusView();
  const [announcement, setAnnouncement] = useState("");
  if (!context) return null;
  const choose = (next: RenewalWorkspaceView) => {
    context.setView(next);
    setAnnouncement(
      next === "focus"
        ? "Focus view: one task at a time. Full view keeps every section."
        : "Full view: every section of this lease.",
    );
  };
  return (
    <div
      aria-label="Lease view"
      className="renewal-view-switch"
      data-renewal-view-switch
      role="group"
    >
      <button
        aria-pressed={context.view === "focus"}
        className="secondary-button renewal-view-switch-button"
        data-selected={context.view === "focus" ? "true" : undefined}
        onClick={() => choose("focus")}
        type="button"
      >
        Focus view
      </button>
      <button
        aria-pressed={context.view === "full"}
        className="secondary-button renewal-view-switch-button"
        data-selected={context.view === "full" ? "true" : undefined}
        onClick={() => choose("full")}
        type="button"
      >
        Full view
      </button>
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </div>
  );
}

/** The Focus pane's place at the top of the workspace body; present only in Focus view. */
export function RenewalFocusViewSlot() {
  const context = useRenewalFocusView();
  const setSlot = context?.setSlot;
  const attach = useCallback(
    (element: HTMLDivElement | null) => setSlot?.(element),
    [setSlot],
  );
  if (context?.view !== "focus") return null;
  return <div className="renewal-focus-slot" data-renewal-view-switch ref={attach} />;
}
