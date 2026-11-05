"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  RENEWAL_VIEW_LABELS,
  isRenewalWorkspaceView,
  type RenewalWorkspaceView,
} from "@/lib/lease-renewal/workspace-view";
import { focusRenewalDashboardControl } from "./RenewalDashboardNavigation";
import { createFocusReveal, type FocusReveal } from "./renewal-focus-reveal";

/**
 * S143: the lease-level view switch. The view, the chosen task and the saved Full view scroll
 * position are page-local presentation state: switching never saves, submits, writes a
 * preference or calls a provider. S152: Focus view shows one task; both Focus view and Full view
 * support the same work and neither is an edit, review or locked mode.
 *
 * S247 R-S247-7 / R-S247-9 (D-OP-6): a lease opens in Guided view, with Focus view and Full view
 * beside it unchanged. A view chosen by hand lasts for that visit: a reload of the page returns to
 * it, its step and its place (kept in this tab's session storage while the page unloads), and the
 * next lease opened opens in Guided view again. An address may name a view (`view`). An older
 * link that names a section or a control in its hash
 * opens Full view there (R-S247-11).
 */

export type { RenewalWorkspaceView };

interface FocusViewValue {
  readonly view: RenewalWorkspaceView;
  readonly setView: (view: RenewalWorkspaceView) => void;
  /** Return to Full view at one existing control instead of the saved scroll position. */
  readonly showInFull: (targetId: string | null) => void;
  readonly selectedActionId: string | null;
  readonly setSelectedActionId: (id: string | null) => void;
  readonly slot: HTMLElement | null;
  readonly setSlot: (element: HTMLElement | null) => void;
  /**
   * The one reveal over the workspace body, shared by Guided view and Focus view so the two never
   * hide and show the same regions against each other. Full view clears it.
   */
  readonly applyReveal: (keep: readonly Element[]) => void;
  /** True when the address named the view, so an older link's hash does not override it. */
  readonly explicitView: boolean;
  /** The step the Guided view shows, kept for a reload of this page. */
  readonly rememberStep: (step: string | null) => void;
  /** The step a reload of this page returns to, once read; null otherwise. */
  readonly restoredStep: string | null;
}

const FocusViewContext = createContext<FocusViewValue | null>(null);

export function useRenewalFocusView() {
  return useContext(FocusViewContext);
}

const CONTINUITY_KEY = "renewal-lease-continuity";
const interactions = ["wheel", "touchstart", "keydown", "mousedown"] as const;

export function RenewalFocusViewProvider({
  children,
  initialView = "guided",
  explicitView = false,
}: {
  children: ReactNode;
  /** S247: Guided view unless the address named a view or the surface has no guided view. */
  initialView?: RenewalWorkspaceView;
  explicitView?: boolean;
}) {
  const [view, setViewState] = useState<RenewalWorkspaceView>(initialView);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const current = useRef<RenewalWorkspaceView>(initialView);
  const scrollY = useRef<number | null>(null);
  const fullTarget = useRef<string | null>(null);
  const reveal = useRef<{ body: HTMLElement; reveal: FocusReveal } | null>(null);
  const stepRef = useRef<string | null>(null);
  const [restoredStep, setRestoredStep] = useState<string | null>(null);
  // A reload hands the kept step to the Guided view once (see the continuity effect below).
  const restoreStep = useCallback(
    (step: string) => window.setTimeout(() => setRestoredStep(step), 0),
    [],
  );
  const rememberStep = useCallback((step: string | null) => {
    stepRef.current = step;
  }, []);
  const move = useCallback((next: RenewalWorkspaceView) => {
    if (next === current.current) return false;
    if (current.current === "full") scrollY.current = window.scrollY;
    current.current = next;
    setViewState(next);
    return true;
  }, []);
  // A view chosen by hand: shown, and kept for a reload of this page (see below).
  const setView = useCallback(
    (next: RenewalWorkspaceView) => {
      move(next);
    },
    [move],
  );
  const showInFull = useCallback(
    (targetId: string | null) => {
      fullTarget.current = targetId;
      setView("full");
    },
    [setView],
  );
  const applyReveal = useCallback(
    (keep: readonly Element[]) => {
      const body = slot?.parentElement;
      if (!body) return;
      if (!reveal.current || reveal.current.body !== body) {
        reveal.current?.reveal.clear();
        reveal.current = { body, reveal: createFocusReveal(body) };
      }
      reveal.current.reveal.apply(keep);
    },
    [slot],
  );
  // R-S247-11: an older link that names a section or a control in its hash opens Full view there,
  // unless the address names the view. Presentation only.
  useLayoutEffect(() => {
    if (explicitView || current.current === "full") return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id.startsWith("renewal-") || !document.getElementById(id)) return;
    fullTarget.current = id;
    move("full");
    // Mount only: a later hash comes from the page's own links and is handled in the view.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The Full view is whole again before its scroll position or a requested control is restored.
  useLayoutEffect(() => {
    if (view !== "full") return;
    reveal.current?.reveal.clear();
    reveal.current = null;
    const target = fullTarget.current;
    const y = scrollY.current;
    fullTarget.current = null;
    scrollY.current = null;
    if (target && focusRenewalDashboardControl(target, { viewRequest: false })) return;
    if (y !== null) window.scrollTo?.({ top: y });
  }, [view]);
  useEffect(
    () => () => {
      reveal.current?.reveal.clear();
      reveal.current = null;
    },
    [],
  );
  // R-S247-7: a reload returns to the same view, step and place. They are kept in this tab's own
  // session storage only while the page unloads, and read back once, on a reload of the same
  // address; any other way of opening the lease starts in Guided view at its current step.
  // Nothing here writes the address, saves a record or calls a route.
  useEffect(() => {
    // This page restores its own place on a reload (below), so the browser does not move it.
    if ("scrollRestoration" in window.history)
      window.history.scrollRestoration = "manual";
    const here = () => `${window.location.pathname}${window.location.search}`;
    const save = () => {
      try {
        window.sessionStorage.setItem(
          CONTINUITY_KEY,
          JSON.stringify({
            at: Date.now(),
            path: here(),
            y: window.scrollY,
            view: current.current,
            step: stepRef.current,
          }),
        );
      } catch {
        // A convenience only.
      }
    };
    let timer: number | null = null;
    try {
      const saved = JSON.parse(
        window.sessionStorage.getItem(CONTINUITY_KEY) ?? "null",
      ) as {
        at?: number;
        path?: string;
        y?: number;
        view?: unknown;
        step?: unknown;
      } | null;
      window.sessionStorage.removeItem(CONTINUITY_KEY);
      const navigation = window.performance?.getEntriesByType?.("navigation")?.[0] as
        | { type?: string }
        | undefined;
      if (
        saved &&
        saved.path === here() &&
        typeof saved.at === "number" &&
        Date.now() - saved.at < 10 * 60_000 &&
        navigation?.type === "reload" &&
        !window.location.hash
      ) {
        if (!explicitView && isRenewalWorkspaceView(saved.view)) move(saved.view);
        if (typeof saved.step === "string") {
          stepRef.current = saved.step;
          restoreStep(saved.step);
        }
        if (typeof saved.y === "number") {
          const y = saved.y;
          // While the page's reads settle and its height shifts, it is held at the kept place for
          // a few seconds, until the person scrolls, types or clicks themselves.
          const startedAt = Date.now();
          const hold = () => {
            if (Math.abs(window.scrollY - y) > 2) window.scrollTo?.({ top: y });
            timer = Date.now() - startedAt < 4000 ? window.setTimeout(hold, 100) : null;
          };
          const release = () => {
            if (timer !== null) window.clearTimeout(timer);
            timer = null;
            for (const name of interactions) window.removeEventListener(name, release);
          };
          for (const name of interactions)
            window.addEventListener(name, release, { once: true, passive: true });
          hold();
        }
      }
    } catch {
      // A convenience only.
    }
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      if (timer !== null) window.clearTimeout(timer);
    };
    // Mount only.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const value = useMemo(
    () => ({
      view,
      setView,
      showInFull,
      selectedActionId,
      setSelectedActionId,
      slot,
      setSlot,
      applyReveal,
      explicitView,
      rememberStep,
      restoredStep,
    }),
    [
      view,
      setView,
      showInFull,
      selectedActionId,
      slot,
      applyReveal,
      explicitView,
      rememberStep,
      restoredStep,
    ],
  );
  return <FocusViewContext.Provider value={value}>{children}</FocusViewContext.Provider>;
}

const ANNOUNCEMENTS: Record<RenewalWorkspaceView, string> = {
  guided: "Guided view: the renewal path and the one step to do now.",
  focus: "Focus view: one task at a time. Full view keeps every section.",
  full: "Full view: every section of this lease.",
};

/** The accessible lease-level switch, rendered in the workspace toolbar in every view. */
export function RenewalFocusViewSwitch({
  views = ["guided", "focus", "full"],
}: {
  /** S247: Guided view, Focus view and Full view; a surface without a guided view omits it. */
  views?: readonly RenewalWorkspaceView[];
}) {
  const context = useRenewalFocusView();
  const [announcement, setAnnouncement] = useState("");
  if (!context) return null;
  const choose = (next: RenewalWorkspaceView) => {
    context.setView(next);
    setAnnouncement(ANNOUNCEMENTS[next]);
  };
  return (
    <div
      aria-label="Lease view"
      className="renewal-view-switch"
      data-renewal-view-switch
      role="group"
    >
      {views.map((option) => (
        <button
          aria-pressed={context.view === option}
          className="secondary-button renewal-view-switch-button"
          data-selected={context.view === option ? "true" : undefined}
          key={option}
          onClick={() => choose(option)}
          type="button"
        >
          {RENEWAL_VIEW_LABELS[option]}
        </button>
      ))}
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </div>
  );
}

/** The Guided or Focus pane's place at the top of the workspace body; absent in Full view. */
export function RenewalFocusViewSlot() {
  const context = useRenewalFocusView();
  const setSlot = context?.setSlot;
  const attach = useCallback(
    (element: HTMLDivElement | null) => setSlot?.(element),
    [setSlot],
  );
  if (!context || context.view === "full") return null;
  return <div className="renewal-focus-slot" data-renewal-view-switch ref={attach} />;
}
