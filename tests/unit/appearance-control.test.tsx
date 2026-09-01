// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Appearance } from "@/components/layout/Appearance";
import { NotificationMenu } from "@/components/layout/NotificationMenu";
import { THEME_STORAGE_KEY } from "@/lib/ui/theme";

type MediaListener = (event: MediaQueryListEvent) => void;

function installMatchMedia(initialDark = false) {
  let matches = initialDark;
  const listeners = new Set<MediaListener>();
  const media = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: MediaListener) =>
      listeners.delete(listener),
    addListener: (listener: MediaListener) => listeners.add(listener),
    removeListener: (listener: MediaListener) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as MediaQueryList;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
  return {
    change(nextDark: boolean) {
      matches = nextDark;
      for (const listener of listeners) {
        listener({ matches, media: media.media } as MediaQueryListEvent);
      }
    },
    listenerCount: () => listeners.size,
  };
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
  document.documentElement.dataset.themeSetting = "system";
  document.documentElement.style.colorScheme = "light";
  installMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("S85 Appearance disclosure", () => {
  it("adopts the pre-paint root setting before the hydrated controller writes", async () => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themeSetting = "dark";
    document.documentElement.style.colorScheme = "dark";

    render(<Appearance />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Appearance/ })).toHaveTextContent(
        "Dark",
      ),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themeSetting).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("opens on the checked radio and applies a persistent explicit choice without closing", async () => {
    const user = userEvent.setup();
    render(<Appearance />);

    const trigger = screen.getByRole("button", { name: /Appearance/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);

    const system = screen.getByRole("radio", { name: "Use device setting" });
    await waitFor(() => expect(system).toHaveFocus());
    expect(system).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themeSetting).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveTextContent("Dark");
  });

  it("follows device changes only in system mode and removes stale listeners", async () => {
    const media = installMatchMedia(false);
    const user = userEvent.setup();
    render(<Appearance />);
    await user.click(screen.getByRole("button", { name: /Appearance/ }));

    expect(media.listenerCount()).toBe(1);
    media.change(true);
    expect(document.documentElement.dataset.theme).toBe("dark");

    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(media.listenerCount()).toBe(0);
    media.change(true);
    expect(document.documentElement.dataset.theme).toBe("light");

    await user.click(screen.getByRole("radio", { name: "Use device setting" }));
    expect(media.listenerCount()).toBe(1);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("supports radio arrow exploration, Escape focus return, and outside dismissal", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Appearance />
        <button type="button">Outside</button>
      </div>,
    );
    const trigger = screen.getByRole("button", { name: /Appearance/ });
    await user.click(trigger);
    const system = screen.getByRole("radio", { name: "Use device setting" });
    await waitFor(() => expect(system).toHaveFocus());

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    const outside = screen.getByRole("button", { name: "Outside" });
    fireEvent.pointerDown(outside);
    outside.focus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(outside).toHaveFocus();
  });

  it("keeps the current page usable and explains storage denial only after a change", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const user = userEvent.setup();
    render(
      <div>
        <input aria-label="Unsent input" defaultValue="Keep this" />
        <Appearance />
      </div>,
    );
    expect(screen.queryByRole("status")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Appearance/ }));
    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByLabelText("Unsent input")).toHaveValue("Keep this");
    expect(screen.getByRole("status")).toHaveTextContent(/could not save/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("coordinates Appearance and Notifications as mutually exclusive root layers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ notifications: [], families: [], unreadTotal: 0 }),
      ),
    );
    const user = userEvent.setup();
    render(
      <>
        <NotificationMenu navigate={() => undefined} />
        <Appearance />
      </>,
    );

    const appearance = screen.getByRole("button", { name: /Appearance/ });
    const notifications = await screen.findByRole("button", { name: "Notifications" });
    await user.click(appearance);
    expect(appearance).toHaveAttribute("aria-expanded", "true");

    await user.click(notifications);
    expect(appearance).toHaveAttribute("aria-expanded", "false");
    expect(notifications).toHaveAttribute("aria-expanded", "true");

    await user.click(appearance);
    expect(appearance).toHaveAttribute("aria-expanded", "true");
    expect(notifications).toHaveAttribute("aria-expanded", "false");
  });
});
