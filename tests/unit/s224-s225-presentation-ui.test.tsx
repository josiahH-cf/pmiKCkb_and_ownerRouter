// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { PresentationSettingsPanel } from "@/components/admin/PresentationSettingsPanel";
import type { PresentationCommand } from "@/lib/staff/business-profile";
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("recovers an original display save after a lost committed response and reload without another POST", async () => {
  let command: PresentationCommand | undefined;
  const fetch = vi.fn(async (url: string, o?: RequestInit) => {
    if (o?.method === "POST") {
      command = JSON.parse(String(o.body));
      throw Error("Fixture lost after commit");
    }
    return Response.json(
      url.includes("operation_id=")
        ? {
            state: "committed",
            operationId: command!.operationId,
            op: "save_display_name",
            result: {
              version: 1,
              displayName: "Fixture application",
              updatedAt: new Date().toISOString(),
              updatedBy: "fixture-admin",
            },
          }
        : { presentation: null },
    );
  });
  vi.stubGlobal("fetch", fetch);
  const first = render(<PresentationSettingsPanel kind="display" />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save display name" })).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "Fixture application" },
  });
  fireEvent.change(screen.getByLabelText("Change reason"), {
    target: { value: "Fixture approved display choice" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save display name" }));
  await screen.findByRole("button", { name: "Check original save" });
  expect(new URL(location.href).searchParams.get("save_display")).toBe(
    command!.operationId,
  );
  first.unmount();
  render(<PresentationSettingsPanel kind="display" />);
  await screen.findByDisplayValue("Fixture application");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save display name" })).toBeEnabled(),
  );
  expect(fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1);
});
it("holds a URL-only unknown save without guessing the lost fields and exposes exact cutoff recovery", async () => {
  history.replaceState(null, "", "/?save_display=8b549b2a-2800-4678-849d-ba678042d95d");
  const fetch = vi.fn(async (_url: string, _options?: RequestInit) =>
    Response.json({ state: "not_recorded" }),
  );
  vi.stubGlobal("fetch", fetch);
  render(<PresentationSettingsPanel kind="display" />);
  await screen.findByText(/local fields are unavailable/);
  expect(screen.queryByRole("button", { name: "Resume exact original save" })).toBeNull();
  expect(screen.getByLabelText("Display name")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Stop original before admission" }),
  ).toBeEnabled();
  expect(fetch.mock.calls.every(([, o]) => !o?.method)).toBe(true);
});

it("holds pre-hydration entry until the current profile loads and retains rapid independent field edits", async () => {
  let settle!: (value: Response) => void;
  let command: PresentationCommand | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, o?: RequestInit) => {
      if (o?.method === "POST") {
        command = JSON.parse(String(o.body));
        throw Error("Lost response");
      }
      if (url.includes("uid="))
        return new Promise<Response>((resolve) => {
          settle = resolve;
        });
      return Response.json({
        actorUid: "fixture-admin",
        profile: null,
        retainedSignature: null,
      });
    }),
  );
  render(<PresentationSettingsPanel kind="profile" uid="fixture-admin" />);
  expect(screen.getByLabelText("name")).toBeDisabled();
  await waitFor(() => expect(settle).toBeTypeOf("function"));
  settle(Response.json({ profile: null }));
  await waitFor(() => expect(screen.getByLabelText("name")).toBeEnabled());
  act(() => {
    fireEvent.change(screen.getByLabelText("name"), {
      target: { value: "Fixture Person" },
    });
    fireEvent.change(screen.getByLabelText("businessTitle"), {
      target: { value: "Manager" },
    });
    fireEvent.change(screen.getByLabelText("source"), {
      target: { value: "source:fixture-reviewed" },
    });
  });
  expect(screen.getByLabelText("name")).toHaveValue("Fixture Person");
  expect(screen.getByLabelText("businessTitle")).toHaveValue("Manager");
  fireEvent.change(screen.getByLabelText("Change reason"), {
    target: { value: "Reviewed exact business contacts" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save business profile" }));
  await screen.findByRole("button", { name: "Check original save" });
  expect(command).toMatchObject({
    op: "save_profile",
    profile: {
      name: "Fixture Person",
      businessTitle: "Manager",
      phone: "",
      hours: "",
      website: "",
      source: "source:fixture-reviewed",
    },
  });
});
