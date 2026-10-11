// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));
import { actionFixture, manualFixture } from "@/tests/helpers/renewal-action-fixtures";
import {
  focusPane,
  renderWorkspace,
  settle,
  stubRenewalRoutes,
  viewButton,
} from "@/tests/helpers/focus-workspace";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("starts with other ready tasks hidden, exposes their expanded state, and toggles by pointer and keyboard", async () => {
  const routes = stubRenewalRoutes(manualFixture());
  await renderWorkspace({ manual: manualFixture() });
  const user = userEvent.setup();
  const toggle = within(focusPane()).getByRole("button", { name: /Also ready for you/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(
    within(focusPane()).queryByRole("navigation", { name: "Other ready tasks" }),
  ).toBeNull();
  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  const choices = within(
    screen.getByRole("navigation", { name: "Other ready tasks" }),
  ).getAllByRole("button");
  const names = choices.map((choice) => choice.textContent);
  expect(new Set(names).size).toBe(names.length);
  expect(names).not.toContain("Owner outreach");
  expect(names).toContain("Tenant offer delivered");
  await user.keyboard(" ");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  await user.keyboard("{Enter}");
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  await user.keyboard("{Enter}");
  expect(screen.queryByRole("navigation", { name: "Other ready tasks" })).toBeNull();
  await user.tab();
  expect(choices).not.toContain(document.activeElement);
  expect(routes.writes()).toEqual([]);
});

it("selects the real task, keeps unsaved work mounted through task/view changes, and sends no operation", async () => {
  const routes = stubRenewalRoutes(manualFixture());
  await renderWorkspace({ manual: manualFixture() });
  const user = userEvent.setup();
  const note = document.querySelector<HTMLTextAreaElement>(
    "#renewal-card-message-owner textarea",
  )!;
  expect(note).not.toBeNull();
  await user.clear(note);
  await user.type(note, "Local unsaved owner wording");
  const before = routes.writes().length;
  await user.click(
    within(focusPane()).getByRole("button", { name: /Also ready for you/ }),
  );
  await user.click(
    within(screen.getByRole("navigation", { name: "Other ready tasks" })).getByRole(
      "button",
      { name: "Tenant offer delivered" },
    ),
  );
  expect(
    within(focusPane()).getByRole("heading", { name: "Tenant offer delivered" }),
  ).toHaveFocus();
  expect(document.getElementById("renewal-manual-tenant_offer")).toBeVisible();
  expect(document.getElementById("renewal-manual-owner_outreach")).not.toBeVisible();
  await user.click(viewButton("Full view"));
  expect(note).toHaveValue("Local unsaved owner wording");
  await user.click(viewButton("Focus view"));
  await settle();
  expect(note).toHaveValue("Local unsaved owner wording");
  expect(routes.writes()).toHaveLength(before);
});

it("keeps the source difference visible independently of equal rent amounts and collapses secondary context", async () => {
  const manual = manualFixture({ owner: "approved_terms", done: ["owner_outreach"] });
  const original = actionFixture({ manual, rentAgreement: "conflict" }).workspace;
  const workspace = {
    ...original,
    summary: { ...original.summary, currentRent: 1250 },
    guidance: { ...original.guidance, currentBaseRent: 1250 },
  };
  stubRenewalRoutes(manual);
  await renderWorkspace({ manual, workspace });
  const pane = focusPane();
  const context = within(pane).getByText("Rent and lease context").closest("details")!;
  expect(context.open).toBe(false);
  expect(pane.textContent).not.toMatch(/Done when: Done/);
  expect(
    within(pane).getByText(/RentVine and the operating Sheet do not agree/),
  ).toBeVisible();
  expect(within(context).getByText("Current rent")).toBeInTheDocument();
  expect(
    within(context).getByText("Contractual lease rent (RentVine)"),
  ).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(within(pane).getByText("Rent and lease context"));
  expect(within(context).getAllByText(/\$1,250\.00/)).toHaveLength(2);
  expect(
    within(context).getByText("Working renewal terms").nextElementSibling,
  ).toHaveTextContent("$1,450.00");
  expect(
    within(pane).getByText(/RentVine and the operating Sheet do not agree/),
  ).toBeVisible();
});

it("keeps outside owner-contact recording distinct from unavailable ordinary outreach after move-out starts", async () => {
  const manual = manualFixture();
  const workspace = actionFixture({ manual, moveOutInitiated: true }).workspace;
  const routes = stubRenewalRoutes(manual);
  await renderWorkspace({ manual, workspace });
  const pane = focusPane();
  const user = userEvent.setup();
  await user.click(within(pane).getByText(/All renewal work \(/));
  await user.click(within(pane).getByRole("button", { name: /^Owner outreach$/ }));
  expect(within(pane).getByRole("heading", { name: "Owner outreach" })).toBeVisible();
  expect(pane).not.toHaveTextContent("Prepare the owner message below.");
  expect(pane).toHaveTextContent("Record owner contact that happened outside the app.");
  expect(pane).toHaveTextContent("Use the move-out guidance below for the next action.");
  expect(pane).toHaveTextContent("RentVine shows a move-out notice for this lease.");
  expect(document.getElementById("renewal-manual-owner_outreach")).toBeVisible();
  expect(routes.writes()).toEqual([]);
});

it("asks staff to review unknown move-out status before owner-message preparation without hiding the record controls", async () => {
  const manual = manualFixture();
  const original = actionFixture({ manual, moveOutInitiated: true }).workspace;
  const workspace = {
    ...original,
    summary: {
      ...original.summary,
      moveOut: {
        ...original.summary.moveOut!,
        state: "unknown" as const,
        label: "Move-out status needs verification.",
      },
    },
  };
  const routes = stubRenewalRoutes(manual);
  await renderWorkspace({ manual, workspace });
  const user = userEvent.setup(),
    pane = focusPane();
  await user.click(within(pane).getByText(/All renewal work \(/));
  await user.click(within(pane).getByRole("button", { name: /^Owner outreach$/ }));
  expect(pane).not.toHaveTextContent("Prepare the owner message below.");
  expect(pane).toHaveTextContent(
    "Review the move-out status before preparing an owner message.",
  );
  expect(pane).toHaveTextContent("Move-out status needs verification.");
  expect(document.getElementById("renewal-manual-owner_outreach")).toBeVisible();
  expect(routes.writes()).toEqual([]);
});

it.each(["not_initiated", "withdrawn"] as const)(
  "preserves ordinary owner preparation for the reviewed %s disposition",
  async (state) => {
    const manual = manualFixture();
    const original = actionFixture({ manual, moveOutInitiated: true }).workspace;
    const workspace = {
      ...original,
      summary: {
        ...original.summary,
        moveOut: {
          ...original.summary.moveOut!,
          state,
          label: "Reviewed disposition.",
        },
      },
    };
    const routes = stubRenewalRoutes(manual);
    await renderWorkspace({ manual, workspace });
    const user = userEvent.setup(),
      pane = focusPane();
    await user.click(within(pane).getByText(/All renewal work \(/));
    await user.click(within(pane).getByRole("button", { name: /^Owner outreach$/ }));
    expect(pane).toHaveTextContent(
      "Prepare the owner message below. Record outreach after contacting the owner.",
    );
    expect(routes.writes()).toEqual([]);
  },
);
