"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";

import { activateTransientLayer, registerTransientLayer } from "@/lib/ui/transient-layer";
import { Icon } from "./Icon";

const HOVER_OPEN_MS = 600;
const HOVER_CLOSE_MS = 150;
const VIEWPORT_GUTTER = 16;
const PANEL_GAP = 8;
const PANEL_MAX_WIDTH = 360;

type PointerPoint = { x: number; y: number };

// Where a hover-capable pointer last moved, shared by every mounted InfoTip. A page that scrolls or
// shifts under a resting pointer also fires pointerenter, at the point where the pointer rests, so an
// enter at that point is the content moving, not the person hovering.
let lastPointerPoint: PointerPoint | null = null;
let pointerWatchers = 0;

function rememberPointerPoint(event: globalThis.PointerEvent) {
  if (event.pointerType === "touch") return;
  lastPointerPoint = { x: event.clientX, y: event.clientY };
}

function watchPointerPoint() {
  pointerWatchers += 1;
  if (pointerWatchers === 1) {
    window.addEventListener("pointermove", rememberPointerPoint, {
      capture: true,
      passive: true,
    });
  }
  return () => {
    pointerWatchers -= 1;
    if (pointerWatchers > 0) return;
    window.removeEventListener("pointermove", rememberPointerPoint, { capture: true });
    lastPointerPoint = null;
  };
}

// Less than a pixel apart is rounding, not movement.
function isSamePoint(point: PointerPoint | null, x: number, y: number) {
  return point !== null && Math.abs(point.x - x) < 1 && Math.abs(point.y - y) < 1;
}

export function InfoTip({
  label,
  content,
  interactive = false,
  parentLayerId,
}: Readonly<{
  label: string;
  content: ReactNode;
  interactive?: boolean;
  parentLayerId?: string;
}>) {
  const reactId = useId();
  const panelId = `info-tip-panel-${reactId}`;
  const layerId = `info-tip-layer-${reactId}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  // Set when the page moved the trigger under a resting pointer: the point where it rests.
  const restingPointRef = useRef<PointerPoint | null>(null);
  const returningFocusRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});

  useEffect(
    () =>
      registerTransientLayer({
        id: layerId,
        family: "infotip",
        parentId: parentLayerId,
        close: () => setOpen(false),
      }),
    [layerId, parentLayerId],
  );

  useEffect(() => {
    const stopWatching = watchPointerPoint();
    return () => {
      stopWatching();
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const closeFromDocument = (returnFocus: boolean) => {
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      openTimerRef.current = null;
      closeTimerRef.current = null;
      setOpen(false);
      // The trigger opens help when it gains focus. Focus returned to it here is not a request to
      // open, so its focus handler skips this one.
      if (returnFocus)
        queueMicrotask(() => {
          returningFocusRef.current = true;
          try {
            triggerRef.current?.focus();
          } finally {
            returningFocusRef.current = false;
          }
        });
    };

    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        closeFromDocument(false);
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        closeFromDocument(false);
      }
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const focusWasInside = panelRef.current?.contains(document.activeElement);
      closeFromDocument(Boolean(focusWasInside));
    };
    const onContextChange = () => closeFromDocument(false);

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("resize", onContextChange);
    window.addEventListener("popstate", onContextChange);
    window.addEventListener("hashchange", onContextChange);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("resize", onContextChange);
      window.removeEventListener("popstate", onContextChange);
      window.removeEventListener("hashchange", onContextChange);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const panel = panelRef.current;
    const width = Math.max(
      0,
      Math.min(PANEL_MAX_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2),
    );
    // Measure at the width the panel is given below. Measured wider (its first render has no width),
    // the text wraps less and reads shorter than it renders, so a panel placed below the trigger can
    // run past the bottom of the viewport and hide its last line, "Open the guide".
    panel.style.width = `${width}px`;
    const measuredHeight = panel.offsetHeight || 120;
    const left = Math.min(
      Math.max(trigger.left, VIEWPORT_GUTTER),
      Math.max(VIEWPORT_GUTTER, window.innerWidth - width - VIEWPORT_GUTTER),
    );
    const below = trigger.bottom + PANEL_GAP;
    const top =
      below + measuredHeight <= window.innerHeight - VIEWPORT_GUTTER
        ? below
        : Math.max(VIEWPORT_GUTTER, trigger.top - measuredHeight - PANEL_GAP);
    setPosition({ left, top, width });
  }, [open]);

  function clearTimers() {
    restingPointRef.current = null;
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    openTimerRef.current = null;
    closeTimerRef.current = null;
  }

  function cancelPendingOpen() {
    restingPointRef.current = null;
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }

  function openNow() {
    clearTimers();
    activateTransientLayer({
      id: layerId,
      family: "infotip",
      parentId: parentLayerId,
    });
    setOpen(true);
  }

  function scheduleOpen() {
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
    openTimerRef.current = window.setTimeout(openNow, HOVER_OPEN_MS);
  }

  function scheduleClose() {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  }

  function isHoverPointer(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return false;
    return (
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(hover: hover) and (pointer: fine)").matches
    );
  }

  function onPointerEnter(event: PointerEvent<HTMLElement>) {
    if (!isHoverPointer(event)) return;
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    if (open) return;
    // The page moved the trigger under a resting pointer (a scroll, for example). That is not a
    // hover, so the delay waits until the pointer itself moves.
    if (isSamePoint(lastPointerPoint, event.clientX, event.clientY)) {
      restingPointRef.current = { x: event.clientX, y: event.clientY };
      return;
    }
    scheduleOpen();
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const restingPoint = restingPointRef.current;
    if (restingPoint === null || open || !isHoverPointer(event)) return;
    if (isSamePoint(restingPoint, event.clientX, event.clientY)) return;
    restingPointRef.current = null;
    scheduleOpen();
  }

  // Leaving the trigger cancels an open still waiting on its delay, so it can never open late and
  // replace a panel opened since.
  function onTriggerPointerLeave() {
    cancelPendingOpen();
    scheduleClose();
  }

  function onTriggerFocus() {
    if (returningFocusRef.current) return;
    openNow();
  }

  return (
    <span className="info-tip">
      <button
        aria-controls={open ? panelId : undefined}
        aria-describedby={!interactive && open ? panelId : undefined}
        aria-expanded={interactive ? open : undefined}
        aria-label={`About ${label}`}
        className="info-tip-trigger"
        onClick={openNow}
        onFocus={onTriggerFocus}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onTriggerPointerLeave}
        onPointerMove={onPointerMove}
        ref={triggerRef}
        type="button"
      >
        <Icon name="info" size={18} />
      </button>
      {open ? (
        <div
          aria-label={interactive ? `About ${label}` : undefined}
          className="info-tip-panel"
          id={panelId}
          onPointerEnter={() => {
            if (closeTimerRef.current !== null) {
              window.clearTimeout(closeTimerRef.current);
              closeTimerRef.current = null;
            }
          }}
          onPointerLeave={scheduleClose}
          ref={panelRef}
          role={interactive ? "region" : "tooltip"}
          style={position}
        >
          {content}
        </div>
      ) : null}
    </span>
  );
}
