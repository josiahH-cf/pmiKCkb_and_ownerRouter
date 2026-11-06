// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RenewalFocusViewProvider } from "@/components/lease-renewal/RenewalFocusViewContext";

// S247 R-S247-9 / S254 L18: a reload in the middle of a step keeps the typing in the field the
// person is still in. A field saves when it is left, and a reload does not leave it, so the words
// are kept in this tab with the place and come back as the same unsaved typing. A password, a
// field the page fills differently later, or an ordinary open of the lease keeps nothing.

const LEASE_PATH = "/lease-renewal/live/desk/lease/fixture-lease";

function Field({ onEntry }: Readonly<{ onEntry: (value: string) => void }>) {
  const [value, setValue] = useState("");
  return (
    <main>
      <label htmlFor="fixture-reason">Reason to include</label>
      <input
        id="fixture-reason"
        onChange={(event) => {
          setValue(event.target.value);
          onEntry(event.target.value);
        }}
        value={value}
      />
      <label htmlFor="fixture-secret">Secret</label>
      <input id="fixture-secret" type="password" defaultValue="" />
    </main>
  );
}

function renderPage(onEntry = vi.fn()) {
  render(
    <RenewalFocusViewProvider>
      <Field onEntry={onEntry} />
    </RenewalFocusViewProvider>,
  );
  return onEntry;
}

function navigation(type: "reload" | "navigate") {
  return vi
    .spyOn(window.performance, "getEntriesByType")
    .mockReturnValue([{ type } as unknown as PerformanceEntry]);
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", LEASE_PATH);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("S247 R-S247-9: unsaved typing survives a reload", () => {
  it("keeps a newer entry made while the old typing is waiting to return", async () => {
    renderPage();
    await userEvent.setup().type(screen.getByLabelText("Reason to include"), "Old text");
    act(() => window.dispatchEvent(new Event("pagehide")));
    cleanup();
    navigation("reload");
    vi.useFakeTimers();
    try {
      renderPage();
      fireEvent.change(screen.getByLabelText("Reason to include"), {
        target: { value: "New text" },
      });
      fireEvent.input(screen.getByLabelText("Reason to include"));
      await act(() => vi.advanceTimersByTimeAsync(2000));
      expect(screen.getByLabelText("Reason to include")).toHaveValue("New text");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the complete field value when it is longer than 5,000 characters", () => {
    renderPage();
    const field = screen.getByLabelText("Reason to include");
    const value = "x".repeat(6000);
    fireEvent.change(field, { target: { value } });
    field.focus();
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(
      JSON.parse(window.sessionStorage.getItem("renewal-lease-continuity")!).typed.value,
    ).toBe(value);
  });

  it("puts the words back into the field the person was still in, as their own entry", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Reason to include"), "Recent leases nearby");
    // The page unloads for a reload while the field still has focus.
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    cleanup();
    navigation("reload");
    const entries = renderPage();
    await waitFor(
      () =>
        expect(screen.getByLabelText("Reason to include")).toHaveValue(
          "Recent leases nearby",
        ),
      { timeout: 4000 },
    );
    // React saw it as typing, so the field's own save runs when it is left.
    expect(entries).toHaveBeenLastCalledWith("Recent leases nearby");
    expect(screen.getByLabelText("Reason to include")).toHaveFocus();
  });

  it("keeps nothing from a password field", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Secret"), "not-kept");
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(window.sessionStorage.getItem("renewal-lease-continuity")).not.toContain(
      "not-kept",
    );
  });

  it("restores nothing when the lease is opened any other way than a reload", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Reason to include"), "Typed before leaving");
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    cleanup();
    navigation("navigate");
    const entries = renderPage();
    await new Promise((done) => setTimeout(done, 1800));
    expect(screen.getByLabelText("Reason to include")).toHaveValue("");
    expect(entries).not.toHaveBeenCalled();
  });
});
