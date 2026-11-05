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
  RENEWAL_VIEW_PARAM,
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
 * beside it unchanged. A view chosen by hand lasts for that visit: it is written into this page's
 * own address (`view`), so a reload or a release returns to it, and the next lease opened from the
 * desk opens in Guided view again. An older link that names a section or a control in its hash
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
}

const FocusViewContext = createContext<FocusViewValue | null>(null);

export function useRenewalFocusView() {
  return useContext(FocusViewContext);
}

/** Write the chosen view (or step) into this page's own address, keeping every other key. */
export function replaceLeaseAddress(changes: Record<string, string | null>) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    if (url.href !== window.location.href)
      window.history.replaceState(window.history.state, "", url.href);
  } catch {
    // The address is a convenience; the view itself is already shown.
  }
}

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
  const move = useCallback((next: RenewalWorkspaceView) => {
    if (next === current.current) return false;
    if (current.current === "full") scrollY.current = window.scrollY;
    current.current = next;
    setViewState(next);
    return true;
  }, []);
  // A view chosen by hand: shown, and kept for this visit through the page's own address.
  const setView = useCallback(
    (next: RenewalWorkspaceView) => {
      move(next);
      replaceLeaseAddress({ [RENEWAL_VIEW_PARAM]: next });
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
  // R-S247-7: a reload returns to the same place on the page. The position is kept in this tab's
  // own session storage only while the page unloads, and read once when it opens again.
  useEffect(() => {
    const key = "renewal-lease-scroll";
    const here = () => `${window.location.pathname}${window.location.search}`;
    const save = () => {
      try {
        window.sessionStorage.setItem(
          key,
          JSON.stringify({ at: Date.now(), path: here(), y: window.scrollY }),
        );
      } catch {
        // A convenience only.
      }
    };
    let restore: number | null = null;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as {
        at?: number;
        path?: string;
        y?: number;
      } | null;
      window.sessionStorage.removeItem(key);
      if (
        saved &&
        saved.path === here() &&
        typeof saved.y === "number" &&
        typeof saved.at === "number" &&
        Date.now() - saved.at < 10 * 60_000 &&
        !window.location.hash
      ) {
        const y = saved.y;
        let tries = 0;
        // The page grows as its reads settle; scroll once it is tall enough, within a moment.
        const attempt = () => {
          tries += 1;
          if (
            document.documentElement.scrollHeight >= y + window.innerHeight ||
            tries > 40
          ) {
            window.scrollTo?.({ top: y });
            restore = null;
            return;
          }
          restore = window.setTimeout(attempt, 50);
        };
        attempt();
      }
    } catch {
      // A convenience only.
    }
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      if (restore !== null) window.clearTimeout(restore);
    };
  }, []);
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
    }),
    [view, setView, showInFull, selectedActionId, slot, applyReveal, explicitView],
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
