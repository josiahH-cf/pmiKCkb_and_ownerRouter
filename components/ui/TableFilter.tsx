"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Keep one mounted filter editor in DOM order, positioned inside the current viewport. */
export function TableFilter({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const position = () => {
    const detail = root.current;
    const panel = detail?.querySelector<HTMLElement>(".renewal-th-filter-panel");
    const summary = detail?.querySelector("summary");
    if (!detail || !panel || !summary) return;
    const cell = detail.closest("th");
    if (cell) cell.style.zIndex = detail.open ? "40" : "";
    if (!detail.open) return;
    const rect = summary.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const height = Math.min(panel.scrollHeight || 320, window.innerHeight - 16);
    const top = Math.min(
      Math.max(8, rect.bottom + 6),
      Math.max(8, window.innerHeight - height - 8),
    );
    Object.assign(panel.style, {
      position: "fixed",
      width: `${width}px`,
      maxWidth: `${width}px`,
      left: `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`,
      top: `${top}px`,
      maxHeight: `${window.innerHeight - top - 8}px`,
      marginTop: "0",
    });
  };
  useEffect(() => {
    const owningCell = root.current?.closest("th");
    const outside = (event: PointerEvent) => {
      const detail = root.current;
      if (
        detail?.open &&
        event.target instanceof Node &&
        !detail.contains(event.target)
      ) {
        detail.open = false;
        position();
      }
    };
    const scroll = (event: Event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".renewal-th-filter-panel")
      )
        position();
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", scroll, true);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", scroll, true);
      document.removeEventListener("pointerdown", outside);
      if (owningCell) owningCell.style.zIndex = "";
    };
  }, []);
  return (
    <details
      ref={root}
      className="renewal-th-filter"
      open={defaultOpen || undefined}
      onToggle={position}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented && root.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          root.current.open = false;
          root.current.querySelector("summary")?.focus();
          position();
        }
      }}
    >
      <summary>{label}</summary>
      <div className="renewal-th-filter-panel">{children}</div>
    </details>
  );
}
