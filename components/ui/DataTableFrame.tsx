"use client";
import { useEffect, useRef, type ReactNode } from "react";
import {
  usePersonalView,
  PersonalViewStatus,
} from "@/components/layout/PersonalViewProvider";
import type { PersonalViewSurface } from "@/lib/ui/personal-views";

/** Adds resizing to the owning semantic table; rows and the table's native controls stay intact. */
export function DataTableFrame({
  children,
  surface,
  label,
  className = "table-scroll",
}: {
  children: ReactNode;
  surface: PersonalViewSurface;
  label: string;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const view = usePersonalView(surface);
  const defaults = useRef<Record<string, number>>({});
  const latest = useRef(view);
  useEffect(() => {
    latest.current = view;
  }, [view]);
  const widths = useRef<Record<string, number>>({});
  useEffect(() => {
    const region = root.current;
    const table = region?.querySelector("table");
    if (!region || !table) return;
    const headers = [
      ...table.querySelectorAll<HTMLTableCellElement>("thead tr:first-child > th"),
    ];
    const cleanup: (() => void)[] = [];
    let cancelDrag: (() => void) | null = null;
    const firstRow = table.querySelector("thead tr:first-child");
    const measureHeader = () => {
      const height = firstRow?.getBoundingClientRect().height ?? 0;
      if (height > 0)
        region.style.setProperty("--table-header-row-height", `${Math.ceil(height)}px`);
    };
    const headerObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measureHeader) : null;
    if (firstRow) headerObserver?.observe(firstRow);
    measureHeader();
    window.addEventListener("resize", measureHeader);
    cleanup.push(() => {
      headerObserver?.disconnect();
      window.removeEventListener("resize", measureHeader);
      region.style.removeProperty("--table-header-row-height");
    });
    headers.forEach((header, index) => {
      if (index > 39) return;
      const key = `c${index}`;
      const heading = (header.querySelector("a, button") ?? header).cloneNode(
        true,
      ) as HTMLElement;
      heading
        .querySelectorAll('.sr-only, [aria-hidden="true"]')
        .forEach((node) => node.remove());
      const label = heading.textContent?.trim() || `Column ${index + 1}`;
      const handle = document.createElement("span");
      handle.className = "table-column-resizer";
      handle.tabIndex = 0;
      handle.setAttribute("role", "separator");
      handle.setAttribute("aria-orientation", "vertical");
      handle.setAttribute("aria-label", `Resize ${label} column`);
      handle.setAttribute("aria-valuemin", "96");
      handle.setAttribute("aria-valuemax", "640");
      handle.setAttribute("title", "Drag to resize; use arrow keys, Home or End");
      const resize = (width: number) => {
        const bounded = Math.round(Math.max(96, Math.min(640, width)));
        widths.current[key] = bounded;
        header.style.width = `${bounded}px`;
        header.style.minWidth = `${bounded}px`;
        handle.setAttribute("aria-valuenow", String(bounded));
        handle.setAttribute("aria-valuetext", `${bounded} pixels`);
      };
      defaults.current[key] = Math.max(
        96,
        Math.min(640, Math.max(160, Math.round(header.getBoundingClientRect().width))),
      );
      resize(latest.current.value.layout.columns[key] ?? defaults.current[key]);
      // A resize remembers that one column's width. The remembered search, filters and sort
      // stay as they are, so sizing a column on a linked view never replaces them.
      const save = () =>
        latest.current.change({
          ...latest.current.value,
          layout: {
            ...latest.current.value.layout,
            columns: {
              ...latest.current.value.layout.columns,
              [key]: widths.current[key],
            },
          },
        });
      const keydown = (event: KeyboardEvent) => {
        const size = widths.current[key];
        const step = event.shiftKey ? 64 : 16;
        const next =
          event.key === "ArrowRight"
            ? size + step
            : event.key === "ArrowLeft"
              ? size - step
              : event.key === "Home"
                ? 96
                : event.key === "End"
                  ? 640
                  : null;
        if (next === null) return;
        event.preventDefault();
        event.stopPropagation();
        resize(next);
        save();
      };
      const down = (event: PointerEvent) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        handle.focus();
        cancelDrag?.();
        const origin = event.clientX;
        const original = widths.current[key];
        const move = (next: PointerEvent) => resize(original + next.clientX - origin);
        const release = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", finish);
          window.removeEventListener("pointercancel", cancel);
          if (cancelDrag === cancel) cancelDrag = null;
        };
        const finish = () => {
          release();
          save();
        };
        const cancel = () => {
          resize(original);
          release();
        };
        cancelDrag = cancel;
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", finish, { once: true });
        window.addEventListener("pointercancel", cancel, { once: true });
      };
      const click = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
      };
      handle.addEventListener("keydown", keydown);
      handle.addEventListener("pointerdown", down);
      handle.addEventListener("click", click);
      header.classList.add("resizable-column");
      header.append(handle);
      cleanup.push(() => {
        handle.remove();
        header.classList.remove("resizable-column");
      });
    });
    return () => {
      cancelDrag?.();
      cleanup.forEach((dispose) => dispose());
    };
  }, [surface]);
  useEffect(() => {
    const headers = root.current?.querySelectorAll<HTMLTableCellElement>(
      "thead tr:first-child > th",
    );
    headers?.forEach((header, index) => {
      const width =
        view.value.layout.columns[`c${index}`] ?? defaults.current[`c${index}`];
      if (width === undefined) return;
      widths.current[`c${index}`] = width;
      header.style.width = `${width}px`;
      header.style.minWidth = `${width}px`;
      header
        .querySelector(".table-column-resizer")
        ?.setAttribute("aria-valuenow", String(width));
      header
        .querySelector(".table-column-resizer")
        ?.setAttribute("aria-valuetext", `${width} pixels`);
    });
  }, [view.value.layout.columns]);
  return (
    <>
      <div
        ref={root}
        className={`${className} data-table-viewport`}
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        {children}
      </div>
      <div className="ui-actions">
        <PersonalViewStatus surface={surface} />
        {surface !== "renewals" ? (
          <button
            className="text-link"
            type="button"
            onClick={() => view.change({ query: "", layout: { columns: {} } })}
          >
            Reset view
          </button>
        ) : null}
      </div>
    </>
  );
}
