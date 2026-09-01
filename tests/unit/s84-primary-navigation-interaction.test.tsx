// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrimaryNav } from "@/components/layout/PrimaryNav";
import type { ResolvedPrimaryNavigationGroup } from "@/lib/navigation/primary-navigation-contract";
import { resetTransientLayersForTests } from "@/lib/ui/transient-layer";

const navigation = vi.hoisted(() => ({ pathname: "/lease-renewal" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

const groups: readonly ResolvedPrimaryNavigationGroup[] = [
  {
    id: "my-work",
    label: "My Work",
    tone: "work",
    items: [
      {
        id: "my-work",
        label: "My Work",
        description: "See assigned work, follow-ups, and items you own.",
        href: "/work",
        activePaths: ["/work"],
        icon: "clipboard-checklist",
      },
      {
        id: "dashboard",
        label: "Dashboard",
        description: "Review current operations and ask about approved PMI KC guidance.",
        href: "/ask",
        activePaths: ["/ask", "/"],
        icon: "assistant-spark",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    tone: "operations",
    items: [
      {
        id: "lease-renewal",
        label: "Lease Renewal",
        description: "Review upcoming renewals and complete the next required action.",
        href: "/lease-renewal",
        activePaths: ["/lease-renewal"],
        icon: "calendar-renew",
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    tone: "admin",
    items: [
      {
        id: "connections",
        label: "Connections",
        description: "Check connected-service status and available setup actions.",
        href: "/connections",
        activePaths: ["/connections"],
        icon: "plug-connected",
      },
    ],
  },
];

beforeEach(() => {
  navigation.pathname = "/lease-renewal";
  installMatchMedia({ narrow: false, fineHover: true });
});

afterEach(() => {
  cleanup();
  resetTransientLayersForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("S84 desktop disclosure navigation", () => {
  it("renders native disclosure buttons and ordinary described links with current markers", () => {
    render(<PrimaryNav groups={groups} />);

    const triggers = screen.getAllByRole("button");
    expect(
      triggers.map((button) =>
        button.textContent?.replace(/Contains current page/g, "").trim(),
      ),
    ).toEqual(["My Work", "Operations", "Admin"]);
    expect(screen.queryByRole("menubar")).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("menuitem")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Operations/ }));
    const lease = screen.getByRole("link", { name: "Lease Renewal" });
    expect(lease).toHaveAttribute("aria-current", "page");
    expect(lease).toHaveAccessibleDescription(
      "Review upcoming renewals and complete the next required action.",
    );
    expect(lease).toHaveAttribute("href", "/lease-renewal");
    expect(screen.getByRole("button", { name: /Operations/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("opens at exactly 350 ms, preserves trigger-to-panel crossing, and closes after 250 ms", () => {
    vi.useFakeTimers();
    render(<PrimaryNav groups={groups} />);
    const trigger = screen.getByRole("button", { name: "My Work" });
    const group = trigger.closest("li");
    if (!group) throw new Error("Missing navigation group");

    fireEvent.pointerEnter(group, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(349));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    act(() => vi.advanceTimersByTime(1));
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerLeave(group, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(249));
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerEnter(group, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(1));
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerLeave(group, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(250));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("does not hover-open on a coarse pointer and suppresses an Escape reopen loop", () => {
    vi.useFakeTimers();
    render(<PrimaryNav groups={groups} />);
    const trigger = screen.getByRole("button", { name: "My Work" });
    const group = trigger.closest("li");
    if (!group) throw new Error("Missing navigation group");

    fireEvent.pointerEnter(group, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(500));
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    act(() => vi.advanceTimersByTime(500));
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.pointerLeave(group, { pointerType: "mouse" });
    fireEvent.pointerEnter(group, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(350));
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("supports Arrow entry, Escape focus return, outside close, and one open group", async () => {
    render(
      <>
        <PrimaryNav groups={groups} />
        <button type="button">Outside</button>
      </>,
    );
    const workTrigger = screen.getByRole("button", { name: "My Work" });
    workTrigger.focus();
    fireEvent.keyDown(workTrigger, { key: "ArrowDown" });
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "My Work" })).toHaveFocus(),
    );

    fireEvent.keyDown(screen.getByRole("link", { name: "My Work" }), { key: "Escape" });
    expect(workTrigger).toHaveFocus();
    expect(workTrigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(workTrigger);
    fireEvent.click(screen.getByRole("button", { name: /Operations/ }));
    expect(workTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Operations/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.getByRole("button", { name: /Operations/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

describe("S84 narrow disclosure navigation", () => {
  it("uses one Menu and one-at-a-time accordions, defaulting to the current route group", () => {
    installMatchMedia({ narrow: true, fineHover: false });
    render(<PrimaryNav groups={groups} />);

    const menu = screen.getByRole("button", { name: "Menu" });
    expect(screen.queryByRole("button", { name: "My Work" })).toBeNull();
    fireEvent.click(menu);

    const region = screen.getByRole("region", { name: "Primary navigation" });
    const operations = within(region).getByRole("button", { name: /Operations/ });
    expect(operations).toHaveAttribute("aria-expanded", "true");
    expect(
      within(region).getByRole("link", { name: "Lease Renewal" }),
    ).toBeInTheDocument();

    fireEvent.click(within(region).getByRole("button", { name: "My Work" }));
    expect(operations).toHaveAttribute("aria-expanded", "false");
    expect(within(region).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("closes an expanded group before the overall Menu and closes everything on selection", () => {
    installMatchMedia({ narrow: true, fineHover: false });
    render(<PrimaryNav groups={groups} />);
    const menu = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(menu);
    const region = screen.getByRole("region", { name: "Primary navigation" });
    const operations = within(region).getByRole("button", { name: /Operations/ });

    fireEvent.keyDown(within(region).getByRole("link", { name: "Lease Renewal" }), {
      key: "Escape",
    });
    expect(operations).toHaveAttribute("aria-expanded", "false");
    expect(operations).toHaveFocus();

    fireEvent.keyDown(operations, { key: "Escape" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveFocus();

    fireEvent.click(menu);
    fireEvent.click(
      within(screen.getByRole("region", { name: "Primary navigation" })).getByRole(
        "link",
        { name: "Lease Renewal" },
      ),
    );
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });
});

function installMatchMedia({
  narrow,
  fineHover,
}: Readonly<{ narrow: boolean; fineHover: boolean }>) {
  const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const matches = query.includes("max-width") ? narrow : fineHover;
      const queryListeners = listeners.get(query) ?? new Set();
      listeners.set(query, queryListeners);
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => queryListeners.add(listener),
        removeEventListener: (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => queryListeners.delete(listener),
        addListener: (listener: (event: MediaQueryListEvent) => void) =>
          queryListeners.add(listener),
        removeListener: (listener: (event: MediaQueryListEvent) => void) =>
          queryListeners.delete(listener),
        dispatchEvent: () => true,
      } as MediaQueryList;
    }),
  );
}
