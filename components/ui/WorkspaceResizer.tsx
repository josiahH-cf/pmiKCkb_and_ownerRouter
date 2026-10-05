"use client";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { usePersonalView } from "@/components/layout/PersonalViewProvider";
import { renderedPanelWidth, type PersonalViewSurface } from "@/lib/ui/personal-views";
const subscribe = (listener: () => void) => {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
};
export function useWorkspacePanelSize(surface: PersonalViewSurface) {
  const view = usePersonalView(surface);
  const [preferred, setPreferred] = useState(view.value.layout.panelWidth ?? 352);
  useEffect(() => {
    queueMicrotask(() => setPreferred(view.value.layout.panelWidth ?? 352));
  }, [view.value.layout.panelWidth]);
  const viewport = useSyncExternalStore(
    subscribe,
    () => window.innerWidth,
    () => 1440,
  );
  const width = renderedPanelWidth(preferred, viewport);
  const change = (next: number, save: boolean) => {
    const intent = Math.round(Math.max(288, Math.min(640, next)));
    setPreferred(intent);
    if (save)
      view.change({
        ...view.value,
        layout: { ...view.value.layout, panelWidth: intent },
      });
  };
  return { width, preferred, change };
}
export function WorkspaceResizer({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number, save: boolean) => void;
}) {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  function key(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 64 : 16;
    const next =
      event.key === "ArrowLeft"
        ? value + step
        : event.key === "ArrowRight"
          ? value - step
          : event.key === "Home"
            ? 288
            : event.key === "End"
              ? 640
              : null;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    onChange(next, true);
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    cleanup.current?.();
    const start = event.clientX;
    let next = value;
    const move = (event: globalThis.PointerEvent) => {
      next = value + start - event.clientX;
      onChange(next, false);
    };
    const dispose = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      cleanup.current = null;
    };
    const finish = () => {
      dispose();
      onChange(next, true);
    };
    const cancel = () => {
      dispose();
      onChange(value, false);
    };
    cleanup.current = dispose;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }
  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={288}
      aria-valuemax={640}
      aria-valuenow={value}
      aria-valuetext={`${value} pixels`}
      className="workspace-resizer"
      onKeyDown={key}
      onPointerDown={down}
      role="separator"
      tabIndex={0}
      title="Drag to resize; use arrow keys, Home or End"
    />
  );
}
