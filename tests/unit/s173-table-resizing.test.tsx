// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenewalDeskTable } from "@/components/lease-renewal/RenewalDeskTable";
import { DEFAULT_RENEWAL_DESK_QUERY_V2 } from "@/lib/lease-renewal/desk-query-v2";
import { getRenewalDeskView } from "@/tests/helpers/sample-desk";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("S173 the actual renewal table", () => {
  it("keeps supporting contacts in a reachable detail path beside each party", () => {
    const row = getRenewalDeskView().items[0];
    row.identity.owners = [
      {
        label: "Fixture Owner",
        sourceRef: "fixture:owner/name",
        email: { label: "fixture-owner@example.test", sourceRef: "fixture:owner/email" },
      },
    ];
    row.ownerNameLabels = ["Fixture Owner"];
    render(
      <RenewalDeskTable
        rows={[row]}
        totalLoaded={1}
        state={DEFAULT_RENEWAL_DESK_QUERY_V2}
        role="Editor"
        shortcuts={{ available: false, tokenFor: () => null }}
        sourceReadOk
      />,
    );
    const summary = screen.getAllByText("Contact details")[0];
    const detail = summary.closest("details")!;
    expect(detail).not.toHaveAttribute("open");
    expect(screen.getByText("Email: fixture-owner@example.test")).not.toBeVisible();
    fireEvent.click(summary);
    expect(screen.getByText("Email: fixture-owner@example.test")).toBeVisible();
  });
  it("exposes bounded keyboard resizing on its current semantic columns without changing the view", () => {
    render(
      <RenewalDeskTable
        rows={[]}
        totalLoaded={0}
        state={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2, sort: "end_date", direction: "desc" }}
        role="Editor"
        shortcuts={{ available: false, tokenFor: () => null }}
        sourceReadOk
      />,
    );
    const resize = screen.getByRole("separator", {
      name: "Resize Lease / location column",
    });
    const before = Number(resize.getAttribute("aria-valuenow"));
    fireEvent.keyDown(resize, { key: "ArrowRight" });
    expect(Number(resize.getAttribute("aria-valuenow"))).toBe(before + 16);
    expect(screen.getByRole("columnheader", { name: /Renewal date/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
  it("keeps only one pointer drag owner and releases its listeners on completion and unmount", () => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    const active = new Set<EventListenerOrEventListenerObject>();
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation((name, handler, options) => {
      if (name === "pointermove") active.add(handler);
      add(name, handler, options);
    });
    vi.spyOn(window, "removeEventListener").mockImplementation(
      (name, handler, options) => {
        if (name === "pointermove") active.delete(handler);
        remove(name, handler, options);
      },
    );
    const mounted = render(
      <RenewalDeskTable
        rows={[]}
        totalLoaded={0}
        state={DEFAULT_RENEWAL_DESK_QUERY_V2}
        role="Editor"
        shortcuts={{ available: false, tokenFor: () => null }}
        sourceReadOk
      />,
    );
    const handle = screen.getByRole("separator", {
      name: "Resize Lease / location column",
    });
    fireEvent.pointerDown(handle, { button: 0, clientX: 100 });
    fireEvent.pointerDown(handle, { button: 0, clientX: 140 });
    expect(active.size).toBe(1);
    fireEvent.pointerMove(window, { clientX: 220 });
    fireEvent.pointerUp(window);
    expect(active.size).toBe(0);
    fireEvent.pointerDown(handle, { button: 0, clientX: 100 });
    mounted.unmount();
    expect(active.size).toBe(0);
  });
});
