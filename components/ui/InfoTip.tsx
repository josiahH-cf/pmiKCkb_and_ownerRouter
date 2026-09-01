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
    return () => clearTimers();
  }, []);

  useEffect(() => {
    if (!open) return;

    const closeFromDocument = (returnFocus: boolean) => {
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      openTimerRef.current = null;
      closeTimerRef.current = null;
      setOpen(false);
      if (returnFocus) queueMicrotask(() => triggerRef.current?.focus());
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
    if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    openTimerRef.current = null;
    closeTimerRef.current = null;
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

  function scheduleClose() {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  }

  function onPointerEnter(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    const finePointer =
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!finePointer) return;
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    if (open) return;
    openTimerRef.current = window.setTimeout(openNow, HOVER_OPEN_MS);
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
        onFocus={openNow}
        onPointerEnter={onPointerEnter}
        onPointerLeave={scheduleClose}
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
