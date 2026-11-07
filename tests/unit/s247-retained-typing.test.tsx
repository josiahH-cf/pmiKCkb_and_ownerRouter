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

function Field({
  onEntry,
  fieldId,
}: Readonly<{ onEntry: (value: string) => void; fieldId: string }>) {
  const [value, setValue] = useState("");
  return (
    <main>
      <label htmlFor={fieldId}>Reason to include</label>
      <input
        id={fieldId}
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

function renderPage(onEntry = vi.fn(), fieldId = "fixture-reason") {
  render(
    <RenewalFocusViewProvider>
      <Field onEntry={onEntry} fieldId={fieldId} />
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
  it("finds the same uniquely named field when the rendered id changes on reload", async () => {
    renderPage(undefined, "before-reload");
    await userEvent
      .setup()
      .type(screen.getByLabelText("Reason to include"), "Kept through a changed id");
    act(() => window.dispatchEvent(new Event("pagehide")));
    cleanup();
    navigation("reload");
    const entries = renderPage(undefined, "after-reload");
    await waitFor(
      () =>
        expect(screen.getByLabelText("Reason to include")).toHaveValue(
          "Kept through a changed id",
        ),
      { timeout: 4000 },
    );
    expect(entries).toHaveBeenLastCalledWith("Kept through a changed id");
  });

  it("keeps a newer entry in a field whose id changed", async () => {
    renderPage(undefined, "before-reload");
    await userEvent
      .setup()
      .type(screen.getByLabelText("Reason to include"), "Earlier entry");
    act(() => window.dispatchEvent(new Event("pagehide")));
    cleanup();
    navigation("reload");
    renderPage(undefined, "after-reload");
    fireEvent.change(screen.getByLabelText("Reason to include"), {
      target: { value: "Newer entry" },
    });
    fireEvent.input(screen.getByLabelText("Reason to include"));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1800)));
    expect(screen.getByLabelText("Reason to include")).toHaveValue("Newer entry");
  });

  it("leaves ambiguous fields alone when neither retains the saved id", async () => {
    renderPage(undefined, "before-reload");
    await userEvent
      .setup()
      .type(screen.getByLabelText("Reason to include"), "Earlier entry");
    act(() => window.dispatchEvent(new Event("pagehide")));
    cleanup();
    navigation("reload");
    render(
      <RenewalFocusViewProvider>
        <main>
          <label htmlFor="one">Reason to include</label>
          <input id="one" defaultValue="First current entry" />
          <label htmlFor="two">Reason to include</label>
          <input id="two" defaultValue="Second current entry" />
        </main>
      </RenewalFocusViewProvider>,
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1800)));
    expect(
      screen
        .getAllByLabelText("Reason to include")
        .map((field) => (field as HTMLInputElement).value),
    ).toEqual(["First current entry", "Second current entry"]);
  });

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

  it("restores a long controlled message inside the lease's main role", async () => {
    function Message({
      id,
      onEntry,
    }: Readonly<{ id: string; onEntry: (text: string) => void }>) {
      const [text, setText] = useState("");
      return (
        <RenewalFocusViewProvider>
          <section role="main">
            <label htmlFor={id}>Message body</label>
            <textarea
              id={id}
              onChange={(event) => {
                setText(event.target.value);
                onEntry(event.target.value);
              }}
              value={text}
            />
          </section>
        </RenewalFocusViewProvider>
      );
    }
    const entered = "Complete synthetic wording. ".repeat(225);
    const onEntry = vi.fn();
    render(<Message id="body-before-reload" onEntry={onEntry} />);
    const body = screen.getByLabelText("Message body");
    body.focus();
    fireEvent.change(body, { target: { value: entered } });
    act(() => window.dispatchEvent(new Event("pagehide")));
    cleanup();
    navigation("reload");
    onEntry.mockClear();
    render(<Message id="body-after-reload" onEntry={onEntry} />);
    await waitFor(
      () => expect(screen.getByLabelText("Message body")).toHaveValue(entered),
      {
        timeout: 4000,
      },
    );
    expect(screen.getByLabelText("Message body")).toHaveFocus();
    expect(onEntry).toHaveBeenCalledWith(entered);
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
