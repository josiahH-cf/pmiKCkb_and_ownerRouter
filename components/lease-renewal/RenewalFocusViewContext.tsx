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
  renewalWorkspaceHashTarget,
  type RenewalWorkspaceView,
} from "@/lib/lease-renewal/workspace-view";
import {
  focusProgrammatically,
  focusRenewalDashboardControl,
} from "./RenewalDashboardNavigation";
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
  readonly stageSlot: HTMLElement | null;
  readonly setStageSlot: (element: HTMLElement | null) => void;
  readonly slot: HTMLElement | null;
  readonly setSlot: (element: HTMLElement | null) => void;
  readonly nowSlot: HTMLElement | null;
  readonly setNowSlot: (element: HTMLElement | null) => void;
  readonly afterSlot: HTMLElement | null;
  readonly setAfterSlot: (element: HTMLElement | null) => void;
  readonly nowPresentation: { readonly stepId: string; readonly state: string } | null;
  readonly setNowPresentation: (
    value: { readonly stepId: string; readonly state: string } | null,
  ) => void;
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
const MAIN_LANDMARK = 'main, [role="main"]';
const interactions = ["wheel", "touchstart", "keydown", "mousedown"] as const;

interface KeptPlace {
  readonly y?: unknown;
  readonly view?: unknown;
  readonly step?: unknown;
  readonly typed?: unknown;
  readonly scope?: unknown;
}

/** Field types whose typing a reload keeps; a password or a choice control is never kept. */
const KEPT_INPUT_TYPES = new Set(["", "text", "search", "number", "tel", "url", "email"]);

type TypedField = { readonly id: string; readonly name?: string; readonly value: string };
type TextField = HTMLInputElement | HTMLTextAreaElement;

function isTextField(element: Element | null): element is TextField {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && KEPT_INPUT_TYPES.has(element.type))
  );
}

function fieldName(field: TextField): string {
  const words = field.labels?.[0]?.textContent ?? field.getAttribute("aria-label") ?? "";
  return words.replace(/\s+/g, " ").trim();
}

function usableField(field: TextField): boolean {
  return (
    !field.disabled &&
    !field.readOnly &&
    !field.closest("[hidden], [inert], [data-renewal-focus-hidden], details:not([open])")
  );
}

/** A reload can change a React-generated id. A unique visible name keeps the same field. */
function findTypedField(typed: TypedField): TextField | null {
  const fields = [
    ...document.querySelectorAll(`:is(${MAIN_LANDMARK}) :is(input, textarea)`),
  ].filter(
    (element): element is TextField => isTextField(element) && usableField(element),
  );
  if (!typed.name) return fields.find((field) => field.id === typed.id) ?? null;
  const named = fields.filter((field) => fieldName(field) === typed.name);
  if (named.length === 1) return named[0];
  return null;
}

/**
 * R-S247-9: the typing in the field the person is still in when the page unloads. A field saves
 * when it is left, and a reload does not leave it, so its words are kept in this tab with the
 * place and put back as the same unsaved typing after the reload.
 */
function typedField(): TypedField | null {
  const element = document.activeElement;
  if (!isTextField(element) || !usableField(element) || !element.closest(MAIN_LANDMARK))
    return null;
  const name = fieldName(element);
  if (!element.id && !name) return null;
  return { id: element.id, name, value: element.value };
}

function isTypedField(value: unknown): value is TypedField {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as TypedField).id === "string" &&
    ((value as TypedField).name === undefined ||
      typeof (value as TypedField).name === "string") &&
    typeof (value as TypedField).value === "string"
  );
}

/**
 * Put kept typing back into its field as the person's own entry, once the field is shown and the
 * page has stopped filling it. A field the person changes first, or one that already reads the
 * same words, is left alone. Returns a function that stops waiting.
 */
function restoreTypedField(typed: TypedField): () => void {
  const startedAt = Date.now();
  let seenAt: number | null = null;
  let seenValue: string | null = null;
  let timer: number | null = null;
  const stop = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    document.removeEventListener("input", entry, true);
    document.removeEventListener("keydown", stop, true);
    document.removeEventListener("pointerdown", stop, true);
  };
  const entry = (event: Event) => {
    if (event.target instanceof Element && findTypedField(typed) === event.target) stop();
  };
  // A person who resumes work first keeps their newer entry and focus.
  document.addEventListener("input", entry, true);
  document.addEventListener("keydown", stop, true);
  document.addEventListener("pointerdown", stop, true);
  timer = window.setTimeout(function check() {
    timer = null;
    const field = findTypedField(typed);
    const now = Date.now();
    if (field) {
      if (field.value === typed.value) return stop();
      if (seenValue !== field.value) {
        // The page is still filling the field; wait until it holds still.
        seenValue = field.value;
        seenAt = now;
      } else if (seenAt !== null && now - seenAt >= 1000) {
        const prototype =
          field instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
          field,
          typed.value,
        );
        stop();
        field.setAttribute("data-renewal-restoring-text", "");
        try {
          field.dispatchEvent(new Event("input", { bubbles: true }));
        } finally {
          field.removeAttribute("data-renewal-restoring-text");
        }
        focusProgrammatically(field);
        return;
      }
    }
    if (now - startedAt < 20_000) timer = window.setTimeout(check, 250);
    else stop();
  }, 250);
  return stop;
}

/** The place this tab kept on unload, taken once, and only on a reload of the same address. */
function readKeptPlace(path: string): KeptPlace | null {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(CONTINUITY_KEY) ?? "null") as
      | (KeptPlace & { at?: unknown; path?: unknown })
      | null;
    window.sessionStorage.removeItem(CONTINUITY_KEY);
    const navigation = window.performance?.getEntriesByType?.("navigation")?.[0] as
      | { type?: string }
      | undefined;
    return saved &&
      saved.path === path &&
      typeof saved.at === "number" &&
      Date.now() - saved.at < 10 * 60_000 &&
      navigation?.type === "reload" &&
      !window.location.hash
      ? saved
      : null;
  } catch {
    // A convenience only.
    return null;
  }
}

export function RenewalFocusViewProvider({
  children,
  allowLegacyFocus = true,
  continuityScope = null,
  initialView = "guided",
  explicitView = false,
}: {
  children: ReactNode;
  allowLegacyFocus?: boolean;
  continuityScope?: string | null;
  /** S247: Guided view unless the address named a view or the surface has no guided view. */
  initialView?: RenewalWorkspaceView;
  explicitView?: boolean;
}) {
  const [view, setViewState] = useState<RenewalWorkspaceView>(initialView);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [stageSlot, setStageSlot] = useState<HTMLElement | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [nowSlot, setNowSlot] = useState<HTMLElement | null>(null);
  const [afterSlot, setAfterSlot] = useState<HTMLElement | null>(null);
  const [nowPresentation, setNowPresentationState] = useState<{
    readonly stepId: string;
    readonly state: string;
  } | null>(null);
  const setNowPresentation = useCallback(
    (next: { readonly stepId: string; readonly state: string } | null) => {
      setNowPresentationState((previous) =>
        previous?.stepId === next?.stepId && previous?.state === next?.state
          ? previous
          : next,
      );
    },
    [],
  );
  const scope = useRef(continuityScope);
  useLayoutEffect(() => {
    scope.current = continuityScope;
  }, [continuityScope]);
  const current = useRef<RenewalWorkspaceView>(initialView);
  const scrollY = useRef<number | null>(null);
  const fullTarget = useRef<string | null>(null);
  const reveal = useRef<{ body: HTMLElement; reveal: FocusReveal } | null>(null);
  const stepRef = useRef<string | null>(null);
  const kept = useRef<KeptPlace | null | undefined>(undefined);
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
      if (current.current === "full") {
        if (targetId) focusRenewalDashboardControl(targetId, { viewRequest: false });
        return;
      }
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
    if ((allowLegacyFocus && explicitView) || current.current === "full") return;
    const id = renewalWorkspaceHashTarget(window.location.hash);
    if (!id || !document.getElementById(id)) return;
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
  // R-S247-9: a reload returns to the same view, step and place. They are kept in this tab's own
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
            scope: scope.current,
            typed: allowLegacyFocus || scope.current ? typedField() : null,
          }),
        );
      } catch {
        // A convenience only.
      }
    };
    let timer: number | null = null;
    let release: (() => void) | null = null;
    let releaseTyped: (() => void) | null = null;
    // Read once per page: a mount that runs again (React's development double mount) reads the
    // same kept place instead of finding it already taken.
    if (kept.current === undefined) kept.current = readKeptPlace(here());
    const saved = kept.current;
    if (
      saved &&
      (allowLegacyFocus || (continuityScope && saved.scope === continuityScope))
    ) {
      if (!explicitView && isRenewalWorkspaceView(saved.view))
        move(saved.view === "focus" && !allowLegacyFocus ? "guided" : saved.view);
      if (typeof saved.step === "string") {
        stepRef.current = saved.step;
        restoreStep(saved.step);
      }
      if (typeof saved.y === "number") {
        const y = saved.y;
        // While the page's reads settle and its height shifts, it is held at the kept place: for
        // at least four seconds and until its height has held still for one, at most fifteen,
        // and never past the person's own scroll, key press or click.
        const startedAt = Date.now();
        let height = -1;
        let stillSince = startedAt;
        const stop = () => {
          if (timer !== null) window.clearTimeout(timer);
          timer = null;
          for (const name of interactions) window.removeEventListener(name, stop);
        };
        const hold = () => {
          const now = Date.now();
          const nextHeight = document.documentElement.scrollHeight;
          if (nextHeight !== height) {
            height = nextHeight;
            stillSince = now;
          }
          if (Math.abs(window.scrollY - y) > 2) window.scrollTo?.({ top: y });
          const settled = now - startedAt >= 4000 && now - stillSince >= 1000;
          timer =
            settled || now - startedAt >= 15_000 ? null : window.setTimeout(hold, 100);
        };
        for (const name of interactions)
          window.addEventListener(name, stop, { once: true, passive: true });
        release = stop;
        hold();
      }
      if (isTypedField(saved.typed)) releaseTyped = restoreTypedField(saved.typed);
    }
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      release?.();
      releaseTyped?.();
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
      stageSlot,
      setStageSlot,
      slot,
      setSlot,
      nowSlot,
      setNowSlot,
      afterSlot,
      setAfterSlot,
      nowPresentation,
      setNowPresentation,
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
      stageSlot,
      slot,
      nowSlot,
      afterSlot,
      nowPresentation,
      setNowPresentation,
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

/** Guided view names the stage once. The older summary statuses remain in Focus and Full view. */
export function RenewalSecondaryStatus({ children }: Readonly<{ children: ReactNode }>) {
  const context = useRenewalFocusView();
  return (
    <span hidden={context?.view === "guided"} data-renewal-secondary-status>
      {children}
    </span>
  );
}

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

/**
 * S247: the existing controls stay at one stable React/DOM position in all three views. Guided
 * puts its header before them and its Now introduction above them in one visual and named card.
 * Full and Focus use transparent wrappers, keeping their layout and the controls' unsaved state.
 */
export function RenewalFocusViewSlot({
  children,
  enabled = true,
}: Readonly<{ children?: ReactNode; enabled?: boolean }>) {
  const context = useRenewalFocusView();
  const setSlot = context?.setSlot;
  const setNowSlot = context?.setNowSlot;
  const setAfterSlot = context?.setAfterSlot;
  const attach = useCallback(
    (element: HTMLDivElement | null) => setSlot?.(element),
    [setSlot],
  );
  const attachNow = useCallback(
    (element: HTMLDivElement | null) => setNowSlot?.(element),
    [setNowSlot],
  );
  const attachAfter = useCallback(
    (element: HTMLDivElement | null) => setAfterSlot?.(element),
    [setAfterSlot],
  );
  if (!context || !enabled) return <>{children}</>;
  const guided = context.view === "guided";
  return (
    <div
      aria-label={guided ? "Guided view" : undefined}
      className={guided ? "panel ui-stack renewal-guided" : "renewal-preserved-workspace"}
      data-renewal-guided={guided ? true : undefined}
      role={guided ? "region" : undefined}
    >
      <div
        className={guided ? "ui-stack renewal-guided-header" : "renewal-focus-slot"}
        data-renewal-view-switch
        ref={attach}
      />
      <div
        aria-busy={guided && !context.nowPresentation ? true : undefined}
        aria-label={guided ? "Now" : undefined}
        className={guided ? "ui-stack renewal-now-card" : "renewal-preserved-workspace"}
        data-renewal-now-state={guided ? context.nowPresentation?.state : undefined}
        data-renewal-now-step={guided ? context.nowPresentation?.stepId : undefined}
        role={guided ? "region" : undefined}
      >
        <div className="ui-stack renewal-now-intro" ref={attachNow} />
        {children}
      </div>
      <div
        className="ui-stack renewal-guided-after"
        data-renewal-presentation-control
        ref={attachAfter}
      />
    </div>
  );
}
