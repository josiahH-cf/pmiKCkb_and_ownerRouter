// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  RentvineUpdatesPanel,
  type RentvineWritebackEffectStatus,
} from "@/components/lease-renewal/RentvineUpdatesPanel";
import type { RentChargeOutcomeRow } from "@/lib/lease-renewal/rent-charge-outcomes";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import type { RentvineWritebackClientProposal } from "@/lib/lease-renewal/writeback/client-projection";
import {
  MANUAL_ACTIVITIES,
  manualRenewalSummary,
  planRenewalWorkspaceAction,
  type ManualActivity,
} from "@/lib/lease-renewal/workspace-state";
import {
  focusPane,
  renderWorkspace,
  settle,
  stubRenewalRoutes,
  workspaceElement,
  type FetchCall,
  type RouteFake,
} from "@/tests/helpers/focus-workspace";
import {
  AFTER_ACCEPTANCE,
  FIXTURE_CYCLE_ID,
  actionFixture,
  manualFixture,
} from "@/tests/helpers/renewal-action-fixtures";

// S145 verification additions (FV acceptance contract, 2026-10-01). Each case drives the real
// RenewalWorkspace and its existing controls through the stateful route fake (the real planner,
// cycle/revision fence and operation replay). Cases cover keyboard landing after the last task, the
// completion record's Reopen control, announcements, unsaved input across refreshes, pending,
// invalid and lost-response saves, every completion branch, the document and lease-date handoffs,
// the unsent Gmail draft handoff and the table of contents after a round trip.

const PINNED_NOW = new Date("2026-09-30T17:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  router.refresh.mockClear();
  router.push.mockClear();
  router.replace.mockClear();
  // S152: a lingering section hash from an earlier test would open the next lease in Full view
  // at that section (the hash target's own behavior); each test opens a lease afresh.
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function heading() {
  return within(focusPane()).getByRole("heading", { level: 2 });
}

/** The pane's polite live region. */
function announcement() {
  return within(focusPane())
    .getAllByRole("status")
    .find((node) => node.getAttribute("aria-live") === "polite")!;
}

async function openFocus(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Focus view" }));
  await settle();
}

async function chooseFromAllWork(user: UserEvent, actionId: string) {
  const pane = focusPane();
  const all = pane.querySelector("details.renewal-focus-all") as HTMLDetailsElement;
  if (!all.open) await user.click(within(pane).getByText(/^All renewal work/));
  const item = pane.querySelector(`[data-renewal-action-id="${actionId}"]`)!;
  await user.click(within(item as HTMLElement).getByRole("button"));
  await settle();
}

/** S156 (b7693d4d): the order is a suggestion; choose the task when another one is shown. */
async function chooseTask(user: UserEvent, label: string) {
  if (heading().textContent?.trim() === label) return;
  const pane = focusPane();
  const ready = within(pane).queryByRole("navigation", { name: "Other ready tasks" });
  const offered = ready ? within(ready).queryByRole("button", { name: label }) : null;
  if (offered) {
    await user.click(offered);
  } else {
    const all = pane.querySelector<HTMLDetailsElement>("details.renewal-focus-all")!;
    if (!all.open) await user.click(within(all).getByText(/^All renewal work/));
    await user.click(within(all).getAllByRole("button", { name: label })[0]!);
  }
  await settle();
  expect(heading()).toHaveTextContent(label);
}

// S155 (0f02e013): a staff record saves when its outcome is chosen; Not applicable needs no
// reason, policy reference or attestation on a lease-dependent activity.
async function recordActivity(
  user: UserEvent,
  key: ManualActivity,
  notApplicable = false,
) {
  const label = MANUAL_ACTIVITIES[key].label;
  await chooseTask(user, label);
  const form = document.getElementById(`renewal-manual-${key}`)!;
  expect(form).toBeVisible();
  await user.selectOptions(
    within(form).getByLabelText(`${label} outcome`),
    notApplicable ? "not_applicable" : "done",
  );
  await settle();
}

async function recordResponse(
  user: UserEvent,
  audience: "owner" | "tenant",
  outcome: string,
) {
  await chooseTask(
    user,
    audience === "owner"
      ? "Record owner response and exact terms"
      : "Record tenant response",
  );
  const form = document.getElementById(`renewal-manual-${audience}_response`)!;
  expect(form).toBeVisible();
  // S156: the response is the recorded fact alone; working terms are saved on the lease.
  expect(
    within(form).queryByLabelText(/Exact owner-approved monthly base rent/),
  ).toBeNull();
  await user.selectOptions(
    within(form).getByLabelText(
      audience === "owner" ? "Owner response" : "Tenant response",
    ),
    outcome,
  );
  await settle();
}

async function recordCompletion(user: UserEvent) {
  await chooseTask(user, "Review recorded completion");
  const block = document.getElementById("renewal-manual-complete")!;
  expect(block).toBeVisible();
  await user.click(
    within(block).getByRole("button", { name: "Record staff completion" }),
  );
  await settle();
}

function workspaceWrites(routes: RouteFake) {
  return routes
    .writes()
    .filter((call) => call.url.includes("/api/lease-renewal/workspace"));
}

function noHiddenFocus() {
  const active = document.activeElement;
  expect(active).not.toBeNull();
  expect(active).not.toBe(document.body);
  expect(active?.closest("[data-renewal-focus-hidden]")).toBeNull();
}

const BEFORE_COMPLETION = manualFixture({
  owner: "approved_terms",
  tenant: "accepted",
  done: ["owner_outreach", "tenant_offer", ...AFTER_ACCEPTANCE],
});

describe(
  "S145 Focus verification: completion, reopen and focus",
  { timeout: 120_000 },
  () => {
    it("lands keyboard focus on the result when the last task completes (FV-27)", async () => {
      const routes = stubRenewalRoutes(BEFORE_COMPLETION);
      const user = userEvent.setup();
      await renderWorkspace({ manual: BEFORE_COMPLETION });
      await openFocus(user);
      await recordCompletion(user);
      expect(manualRenewalSummary(routes.state()).complete).toBe(true);
      const result = within(focusPane()).getByText("Every required step is recorded.");
      expect(result).toHaveFocus();
      noHiddenFocus();
      expect(announcement()).toHaveTextContent("Recorded. Completed: recorded by staff.");
    });

    it("keeps the completion record in the pane and reopens it through the existing route (FV-49)", async () => {
      const complete = manualFixture({
        owner: "approved_terms",
        tenant: "accepted",
        done: ["owner_outreach", "tenant_offer", ...AFTER_ACCEPTANCE],
        completion: true,
      });
      const routes = stubRenewalRoutes(complete);
      const user = userEvent.setup();
      await renderWorkspace({ manual: complete });
      await openFocus(user);
      expect(
        within(focusPane()).getByText("Completed: recorded by staff."),
      ).toBeVisible();
      const record = document.getElementById("renewal-manual-complete")!;
      expect(record).toBeVisible();
      const reopen = within(record).getByRole("button", {
        name: "Reopen recorded completion",
      });
      expect(reopen).toBeEnabled();
      // The rest of the dashboard stays out of the way.
      expect(document.getElementById("renewal-manual-owner_outreach")).not.toBeVisible();
      await user.click(reopen);
      await settle();
      const writes = workspaceWrites(routes);
      expect(writes).toHaveLength(1);
      expect(writes[0]!.body).toMatchObject({
        operation: "record",
        cycleId: FIXTURE_CYCLE_ID,
        expectedRevision: 5,
        action: { kind: "reopen" },
      });
      expect(routes.state()!.completion).toBeNull();
      expect(heading()).toHaveTextContent("Review recorded completion");
      expect(within(focusPane()).getByText("Ready for you.")).toBeVisible();
      expect(announcement()).toHaveTextContent(
        "Next: Review recorded completion. Ready for you.",
      );
    });
  },
);

describe(
  "S145 Focus verification: announcements and refreshes",
  { timeout: 120_000 },
  () => {
    const ACCEPTED = manualFixture({
      owner: "approved_terms",
      tenant: "accepted",
      done: ["owner_outreach", "tenant_offer"],
    });

    it("announces a chosen task and a changed requirement in the polite region (FV-99, FV-64)", async () => {
      const routes = stubRenewalRoutes(ACCEPTED);
      const user = userEvent.setup();
      const view = render(workspaceElement({ manual: ACCEPTED }));
      await settle();
      await openFocus(user);
      const others = within(focusPane()).getByRole("navigation", {
        name: "Other ready tasks",
      });
      await user.click(
        within(others).getByRole("button", { name: "Pet registration follow-up" }),
      );
      await settle();
      expect(heading()).toHaveTextContent("Pet registration follow-up");
      expect(announcement()).toHaveTextContent(
        "Pet registration follow-up: Ready for you.",
      );

      // A colleague records a tenant counter; the refreshed record reopens the owner response as
      // the suggestion. S156: the chosen task stays ready (nothing starts after another task),
      // and the reopened response is offered beside it before anything can be submitted.
      const counter = planRenewalWorkspaceAction(
        routes.state()!,
        {
          kind: "tenant_response",
          outcome: "counter_change_requested",
          source: "Colleague",
        },
        {
          actorUid: "fixture-colleague",
          recordedAt: "2026-09-30T17:00:00.000Z",
          eventId: "00000000-0000-4000-8000-000000000091",
        },
      );
      routes.replace(counter);
      view.rerender(workspaceElement({ manual: counter }));
      await settle();
      expect(heading()).toHaveTextContent("Pet registration follow-up");
      expect(within(focusPane()).getByText("Ready for you.")).toBeVisible();
      expect(within(focusPane()).queryByText(/^Starts after: /)).toBeNull();
      expect(
        within(focusPane()).getByRole("navigation", { name: "Other ready tasks" }),
      ).toHaveTextContent("Record owner response and exact terms");
      expect(manualRenewalSummary(routes.state()).nextActivity).toBe("owner_response");
      expect(workspaceWrites(routes)).toEqual([]);
    });

    it("keeps unfinished input when a colleague's save arrives by refresh (FV-65, FV-86)", async () => {
      const routes = stubRenewalRoutes(ACCEPTED);
      const user = userEvent.setup();
      const view = render(workspaceElement({ manual: ACCEPTED }));
      await settle();
      await openFocus(user);
      expect(heading()).toHaveTextContent(MANUAL_ACTIVITIES.information_form.label);
      const form = document.getElementById("renewal-manual-information_form")!;
      await user.type(
        within(form).getByLabelText(/Source or channel/),
        "Unsaved form note",
      );

      const colleague = planRenewalWorkspaceAction(
        routes.state()!,
        { kind: "activity", activity: "pet", outcome: "done", source: "Colleague" },
        {
          actorUid: "fixture-colleague",
          recordedAt: "2026-09-30T17:00:00.000Z",
          eventId: "00000000-0000-4000-8000-000000000092",
        },
      );
      routes.replace(colleague);
      view.rerender(workspaceElement({ manual: colleague }));
      await settle();
      // The new dependency state is shown and the unsaved entry is untouched.
      expect(heading()).toHaveTextContent(MANUAL_ACTIVITIES.information_form.label);
      expect(within(form).getByLabelText(/Source or channel/)).toHaveValue(
        "Unsaved form note",
      );
      expect(
        within(focusPane()).getByRole("navigation", { name: "Other ready tasks" }),
      ).not.toHaveTextContent("Pet registration follow-up");
      expect(workspaceWrites(routes)).toEqual([]);
    });

    it("keeps the chosen task and its unsaved input across a late source refresh (FV-86, FV-101)", async () => {
      const start = manualFixture();
      const routes = stubRenewalRoutes(start);
      const user = userEvent.setup();
      // S157: a single-source rent is advisory; the staff lane leads from the start.
      const unverified = actionFixture({ manual: start, rentAgreement: "single_source" });
      const view = render(
        workspaceElement({ workspace: unverified.workspace, manual: start }),
      );
      await settle();
      expect(heading()).toHaveTextContent("Owner outreach");
      const others = within(focusPane()).getByRole("navigation", {
        name: "Other ready tasks",
      });
      await user.click(
        within(others).getByRole("button", { name: "Tenant offer delivered" }),
      );
      await settle();
      const outreach = document.getElementById("renewal-manual-tenant_offer")!;
      await user.type(
        within(outreach).getByLabelText(/Source or channel/),
        "Unsaved call note",
      );
      const before = announcement().textContent;

      // A refresh that changes nothing relevant keeps the same task without a jump.
      view.rerender(
        workspaceElement({
          workspace: actionFixture({
            manual: structuredClone(start),
            rentAgreement: "single_source",
          }).workspace,
          manual: structuredClone(start),
        }),
      );
      await settle();
      expect(heading()).toHaveTextContent("Tenant offer delivered");
      expect(announcement().textContent).toBe(before);

      // The late source refresh confirms the rent: the choice and the entry stay.
      view.rerender(
        workspaceElement({
          workspace: actionFixture({ manual: start }).workspace,
          manual: start,
        }),
      );
      await settle();
      expect(heading()).toHaveTextContent("Tenant offer delivered");
      expect(within(outreach).getByLabelText(/Source or channel/)).toHaveValue(
        "Unsaved call note",
      );
      expect(workspaceWrites(routes)).toEqual([]);
    });

    it("states failed supporting reads and the move-out notice in the pane (FV-43, FV-73)", async () => {
      const start = manualFixture();
      stubRenewalRoutes(start);
      const user = userEvent.setup();
      const moving = actionFixture({ manual: start, moveOutInitiated: true });
      render(
        workspaceElement({
          workspace: moving.workspace,
          manual: start,
          extra: { auxiliaryFailures: [{ key: "communications", status: "failed" }] },
        }),
      );
      await settle();
      await openFocus(user);
      const unavailable = within(focusPane()).getByRole("list", {
        name: "Supporting information unavailable",
      });
      expect(unavailable).toHaveTextContent(
        "linked communication status: read did not complete",
      );
      expect(
        within(focusPane()).getByText("RentVine shows a move-out notice for this lease."),
      ).toBeVisible();
      // The Full view keeps its own notice, unchanged.
      await user.click(screen.getByRole("button", { name: "Full view" }));
      expect(
        screen.getByText("linked communication status: read did not complete"),
      ).toBeVisible();
    });

    it("keeps a value typed in Full view through Focus and back; only leaving the control saves it (FV-25)", async () => {
      const routes = stubRenewalRoutes(manualFixture());
      const user = userEvent.setup();
      await renderWorkspace({ manual: manualFixture() });
      await user.click(screen.getByRole("button", { name: "Full view" }));
      await settle();
      const offer = document.getElementById(
        "renewal-manual-tenant_offer",
      ) as HTMLDetailsElement;
      offer.open = true;
      const field = within(offer).getByLabelText(/Source or channel/);
      await user.type(field, "Typed in Full view");
      await openFocus(user);
      await settle(10);
      expect(offer).not.toBeVisible();
      // S155: leaving the control saved the note once; the switch itself sent nothing more.
      const saves = workspaceWrites(routes);
      expect(saves).toHaveLength(1);
      expect(saves[0]!.body?.action).toMatchObject({
        activity: "tenant_offer",
        source: "Typed in Full view",
      });
      const requests = routes.calls.length;
      await user.click(screen.getByRole("button", { name: "Full view" }));
      await settle();
      expect(field).toHaveValue("Typed in Full view");
      expect(field).toBeVisible();
      await openFocus(user);
      await user.click(screen.getByRole("button", { name: "Full view" }));
      await settle();
      expect(field).toHaveValue("Typed in Full view");
      expect(routes.calls.length).toBe(requests);
    });
  },
);

describe(
  "S145 Focus verification: choosing, identity and keyboard",
  { timeout: 120_000 },
  () => {
    it("choosing every task sends nothing and changes no status (FV-39)", async () => {
      const routes = stubRenewalRoutes(manualFixture());
      const user = userEvent.setup();
      await renderWorkspace({ manual: manualFixture() });
      await openFocus(user);
      const pane = focusPane();
      await user.click(within(pane).getByText(/^All renewal work/));
      const groups = () =>
        [...pane.querySelectorAll("h3.renewal-focus-group")].map(
          (node) => node.textContent,
        );
      const statuses = groups();
      const requests = routes.calls.length;
      for (const item of [...pane.querySelectorAll("[data-renewal-action-id]")]) {
        await user.click(within(item as HTMLElement).getByRole("button"));
        await settle();
      }
      expect(groups()).toEqual(statuses);
      expect(routes.calls.length).toBe(requests);
      expect(router.refresh).not.toHaveBeenCalled();
    });

    it("keeps the lease and cycle identifiable through task changes (FV-41)", async () => {
      const accepted = manualFixture({
        owner: "approved_terms",
        tenant: "accepted",
        done: ["owner_outreach", "tenant_offer"],
      });
      stubRenewalRoutes(accepted);
      const user = userEvent.setup();
      await renderWorkspace({ manual: accepted });
      await openFocus(user);
      const title = screen.getByRole("heading", { level: 1 });
      const cycle = () => within(focusPane()).getByText("Cycle").nextElementSibling!;
      expect(title).toBeVisible();
      expect(cycle()).toHaveTextContent("Lease end 12/31/2026");
      expect(within(focusPane()).getByText("Working renewal terms")).toBeVisible();
      const others = within(focusPane()).getByRole("navigation", {
        name: "Other ready tasks",
      });
      await user.click(
        within(others).getByRole("button", { name: "Utility proof follow-up" }),
      );
      await settle();
      expect(heading()).toHaveTextContent("Utility proof follow-up");
      expect(title).toBeVisible();
      expect(cycle()).toHaveTextContent("Lease end 12/31/2026");
    });

    it("operates the pane's controls from the keyboard without reaching hidden content (FV-26)", async () => {
      stubRenewalRoutes(manualFixture());
      const user = userEvent.setup();
      await renderWorkspace({ manual: manualFixture() });
      screen.getByRole("button", { name: "Focus view" }).focus();
      await user.keyboard("{Enter}");
      await settle();
      // Tab to the end of the page, then once more through the whole page: nothing hidden in Focus
      // ever takes focus. Leaving the last control puts focus on the document body before it wraps.
      const reached = new Set<string>();
      let wraps = 0;
      for (let index = 0; index < 400 && wraps < 2; index += 1) {
        await user.tab();
        if (document.activeElement === document.body) {
          wraps += 1;
          continue;
        }
        noHiddenFocus();
        reached.add((document.activeElement?.textContent ?? "").trim());
      }
      expect(wraps).toBe(2);
      expect([...reached]).toContain("Market rent comparison");
      expect([...reached]).toContain("Show this task in Full view");
      // Enter on another ready task chooses it and moves focus to its heading.
      const others = within(focusPane()).getByRole("navigation", {
        name: "Other ready tasks",
      });
      within(others).getByRole("button", { name: "Market rent comparison" }).focus();
      await user.keyboard("{Enter}");
      await settle();
      expect(heading()).toHaveTextContent("Market rent comparison");
      expect(heading()).toHaveFocus();
      // Space on "Show this task in Full view" returns to Full view at the task's control.
      within(focusPane())
        .getByRole("button", { name: "Show this task in Full view" })
        .focus();
      await user.keyboard(" ");
      await settle();
      expect(screen.queryByRole("region", { name: "Focus view" })).toBeNull();
      expect(document.activeElement?.closest("#renewal-section-comps")).not.toBeNull();
    });

    it("moves focus to each table-of-contents section before and after a round trip (FV-14)", async () => {
      stubRenewalRoutes(manualFixture());
      const user = userEvent.setup();
      await renderWorkspace({ manual: manualFixture() });
      await user.click(screen.getByRole("button", { name: "Full view" }));
      await settle();
      const walk = async () => {
        const nav = screen.getByRole("navigation", {
          name: "Renewal dashboard sections",
        });
        const links = within(nav).getAllByRole("link");
        expect(links.length).toBe(5);
        for (const link of links) {
          const target = link.getAttribute("href")!.slice(1);
          await user.click(link);
          await settle();
          expect(document.getElementById(target)).not.toBeNull();
          expect(document.activeElement?.closest(`#${target}`), target).not.toBeNull();
        }
      };
      await walk();
      await openFocus(user);
      await user.click(screen.getByRole("button", { name: "Full view" }));
      await settle();
      await walk();
    });
  },
);

describe("S145 Focus verification: saves and recovery", { timeout: 120_000 }, () => {
  // S155: typing a note first (unsaved until the control is left), then choosing the outcome
  // saves one record carrying both.
  async function fillOutreach(user: UserEvent, source: string) {
    const form = document.getElementById("renewal-manual-owner_outreach")!;
    await user.type(within(form).getByLabelText(/Source or channel/), source);
    return form;
  }
  async function chooseDone(user: UserEvent, form: HTMLElement) {
    await user.selectOptions(
      within(form).getByLabelText("Owner outreach outcome"),
      "done",
    );
  }

  it("keeps the task and the entered values visible while a save is pending (FV-54)", async () => {
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    const form = await fillOutreach(user, "Owner phone call");
    const release = routes.holdNextRecord();
    await chooseDone(user, form);
    await settle();
    expect(heading()).toHaveTextContent("Owner outreach");
    expect(within(form).getByText("Saving owner outreach")).toBeInTheDocument();
    expect(within(form).getByLabelText(/Source or channel/)).toHaveValue(
      "Owner phone call",
    );
    expect(within(form).getByLabelText("Owner outreach outcome")).toHaveValue("done");
    await act(async () => {
      release();
      await settle();
    });
    expect(routes.state()!.activities.owner_outreach).toMatchObject({
      outcome: "done",
      source: "Owner phone call",
    });
    expect(heading()).toHaveTextContent("Tenant offer delivered");
  });

  it("keeps invalid working input typed without a request and without advancing (FV-55)", async () => {
    // S155: an invalid entry stays in its control and saves nothing; the task is unchanged.
    const routes = stubRenewalRoutes(manualFixture({ done: ["owner_outreach"] }));
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture({ done: ["owner_outreach"] }) });
    await chooseTask(user, "Record owner response and exact terms");
    const form = document.getElementById("renewal-manual-owner_response")!;
    const rent = within(form).getByLabelText("Working monthly rent");
    await user.type(rent, "about 1450");
    await user.tab();
    await settle();
    expect(rent).toHaveValue("about 1450");
    expect(
      within(form).getByText(/Nothing was saved for this field/),
    ).toBeInTheDocument();
    expect(routes.writes()).toEqual([]);
    expect(heading()).toHaveTextContent("Record owner response and exact terms");
    expect(within(focusPane()).getByText("Waiting on the owner.")).toBeVisible();
  });

  it("keeps the entry after a lost response and recovers it with the same operation (FV-56, FV-88)", async () => {
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    const form = document.getElementById("renewal-manual-owner_outreach")!;
    routes.loseNextRecordResponse();
    await chooseDone(user, form);
    await settle();
    // The server applied it, but this page never saw a confirmed readback: no advance, no claim.
    expect(heading()).toHaveTextContent("Owner outreach");
    expect(within(form).getByText(/The save did not finish\./)).toBeInTheDocument();
    expect(within(form).getByLabelText("Owner outreach outcome")).toHaveValue("done");
    // Retrying the same entry reuses its operation, so the store replays the one record.
    await user.click(within(form).getByRole("button", { name: "Try again" }));
    await settle();
    const writes = workspaceWrites(routes);
    expect(writes).toHaveLength(2);
    expect(writes[1]!.body?.operationId).toBe(writes[0]!.body?.operationId);
    expect(routes.state()!.activities.owner_outreach?.outcome).toBe("done");
    expect(routes.state()!.revision).toBe(6);
    expect(heading()).toHaveTextContent("Tenant offer delivered");
  });
});

describe(
  "S145 Focus verification: every completion branch in the pane",
  { timeout: 300_000 },
  () => {
    it("walks a tenant counter through new terms to staff completion (FV-52)", async () => {
      const start = manualFixture({
        owner: "approved_terms",
        done: ["owner_outreach", "tenant_offer"],
      });
      const routes = stubRenewalRoutes(start);
      const user = userEvent.setup();
      render(workspaceElement({ manual: start }));
      await settle();
      await openFocus(user);
      await recordResponse(user, "tenant", "counter_change_requested");
      expect(manualRenewalSummary(routes.state()).nextActivity).toBe("owner_response");
      await recordResponse(user, "owner", "approved_terms");
      expect(routes.state()!.termsRevision).toBe(2);
      await recordActivity(user, "tenant_offer");
      await recordResponse(user, "tenant", "accepted");
      for (const key of AFTER_ACCEPTANCE)
        await recordActivity(user, key, key === "rhino" || key === "assisted_housing");
      await recordCompletion(user);
      expect(
        within(focusPane()).getByText("Completed: recorded by staff."),
      ).toBeVisible();
      expect(manualRenewalSummary(routes.state())).toMatchObject({
        complete: true,
        nonRenewal: false,
      });
      expect(routes.state()!.termsRevision).toBe(2);
      const writes = workspaceWrites(routes);
      expect(new Set(writes.map((call) => call.body?.operationId)).size).toBe(
        writes.length,
      );
    });

    it("walks a tenant decline to the non-renewal handoff and completion (FV-52)", async () => {
      const start = manualFixture({
        owner: "approved_terms",
        done: ["owner_outreach", "tenant_offer"],
      });
      const routes = stubRenewalRoutes(start);
      const user = userEvent.setup();
      render(workspaceElement({ manual: start }));
      await settle();
      await openFocus(user);
      await recordResponse(user, "tenant", "declined_nonrenewing");
      await recordActivity(user, "non_renewal_handoff");
      await recordCompletion(user);
      expect(
        within(focusPane()).getByText("Completed: recorded by staff."),
      ).toBeVisible();
      expect(manualRenewalSummary(routes.state())).toMatchObject({
        complete: true,
        nonRenewal: true,
      });
      // The renewal-branch activities never became work on this path.
      expect(routes.state()!.activities.information_form).toBeUndefined();
    });
  },
);

describe(
  "S145 Focus verification: handoffs and source work",
  { timeout: 120_000 },
  () => {
    it("shows the document packet handoff with the documents task (FV-51)", async () => {
      const accepted = manualFixture({
        owner: "approved_terms",
        tenant: "accepted",
        done: ["owner_outreach", "tenant_offer", "information_form", "form_returned"],
      });
      stubRenewalRoutes(accepted);
      const user = userEvent.setup();
      await renderWorkspace({ manual: accepted });
      await openFocus(user);
      await chooseFromAllWork(user, "manual.documents");
      expect(heading()).toHaveTextContent(MANUAL_ACTIVITIES.documents.label);
      expect(document.getElementById("renewal-manual-documents")).toBeVisible();
      expect(document.getElementById("renewal-step-document-packet")).toBeVisible();
      expect(document.getElementById("renewal-manual-pet")).not.toBeVisible();
    });

    it("keeps unknown, conflicting and verified rent distinct in the pane (FV-47)", async () => {
      const user = userEvent.setup();
      const pill = () =>
        within(document.getElementById("renewal-field-current_rent") ?? document.body);

      // Unknown: one source only. S157: the staff lane leads; the difference stays visible in
      // the rent working area once that work is chosen, and in Full view.
      const start = manualFixture();
      stubRenewalRoutes(start);
      render(
        workspaceElement({
          workspace: actionFixture({ manual: start, rentAgreement: "single_source" })
            .workspace,
          manual: start,
        }),
      );
      await settle();
      expect(heading()).toHaveTextContent("Owner outreach");
      expect(within(focusPane()).getByText("Ready for you.")).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Full view" }));
      await settle();
      expect(document.getElementById("renewal-rent-and-charges")).toBeVisible();
      expect(pill().getByText("One source")).toBeVisible();
      cleanup();

      // Conflicting: the sample lease whose RentVine and Sheet rents disagree. An Approver resolves it.
      const walnut = manualFixture({}, "lease-1207-walnut-2");
      stubRenewalRoutes(walnut);
      render(
        workspaceElement({
          leaseId: "lease-1207-walnut-2",
          manual: walnut,
          role: "Approver",
        }),
      );
      await settle();
      await chooseFromAllWork(user, "evidence.resolve-source-conflicts");
      expect(within(focusPane()).getByText("Ready for you.")).toBeVisible();
      const check = document.getElementById("renewal-card-data-check")!;
      expect(check).toBeVisible();
      expect(within(check).getByText("Needs your decision")).toBeVisible();
      cleanup();

      // Verified: the sample lease whose sources agree. The rent task is done, not offered.
      const maple = manualFixture({}, "lease-4821-maple-4");
      stubRenewalRoutes(maple);
      render(workspaceElement({ leaseId: "lease-4821-maple-4", manual: maple }));
      await settle();
      expect(heading()).not.toHaveTextContent("Verify contractual base rent");
      await chooseFromAllWork(user, "manual.owner_outreach");
      const done = within(focusPane()).getByRole("heading", { name: /^Done \(/ });
      expect(done.parentElement).toHaveTextContent("Verify contractual base rent");
    });

    it("confirms a prepared lease-date update in the pane through the existing route (FV-48)", async () => {
      const proposal = datesProposal("lease-318-cedar-7");
      const row: RentChargeOutcomeRow = {
        id: "rentvine:dates",
        destination: "rentvine",
        intent: "future",
        label: "RentVine lease renewal dates",
        state: "prepared",
        stateLabel: "Prepared, awaiting Admin confirmation",
        detail: "Lease dates endDate to 2027-08-31.",
        anchor: "#rentvine-updates-title",
        attention: false,
      };
      const execute = async (focus: boolean) => {
        const routes = stubRenewalRoutes(manualFixture(), {
          other: (call) =>
            call.url.includes("/api/lease-renewal/rentvine-writeback")
              ? call.method === "POST"
                ? Response.json({
                    status: "executed",
                    duplicate: false,
                    receipt: {
                      provider_ref: "lease:fixture",
                      result_hash: "e".repeat(64),
                    },
                    projection: "projected",
                  })
                : Response.json({
                    status: "ok",
                    proposal,
                    effects: statusFor(proposal, "succeeded"),
                    expired: false,
                  })
              : null,
        });
        const user = userEvent.setup();
        await renderWorkspace({
          manual: manualFixture(),
          role: "Admin",
          rentChargeStatus: [row],
          extra: {
            rentvineUpdatesPanel: (
              <RentvineUpdatesPanel
                initialEffects={statusFor(proposal, "not_started")}
                initialProposal={proposal}
                leaseId="lease-318-cedar-7"
                role="Admin"
              />
            ),
          },
        });
        if (focus) {
          await chooseFromAllWork(user, "support.rentvine:dates");
          expect(heading()).toHaveTextContent("RentVine lease renewal dates");
          expect(within(focusPane()).getByText("Ready for you.")).toBeVisible();
        } else {
          await user.click(screen.getByRole("button", { name: "Full view" }));
          await settle();
        }
        const area = document.getElementById("renewal-rent-and-charges")!;
        expect(area).toBeVisible();
        await user.click(within(area).getByText("Review and confirm…"));
        await user.click(within(area).getByText("Confirm this exact effect once"));
        await settle();
        const posts = routes
          .writes()
          .filter((call) => call.url.includes("/api/lease-renewal/rentvine-writeback"));
        expect(posts).toHaveLength(1);
        // No staff record or other write rides along with the provider confirmation.
        expect(workspaceWrites(routes)).toEqual([]);
        const body = posts[0]!.body;
        cleanup();
        vi.unstubAllGlobals();
        return body;
      };
      const fromFocus = await execute(true);
      expect(fromFocus).toEqual({
        operation: "execute",
        leaseId: "lease-318-cedar-7",
        previewHash: proposal.preview_hash,
        effectHash: proposal.effects[0]!.effect_hash,
        confirm: true,
      });
      expect(await execute(false)).toEqual(fromFocus);
    });

    it("prepares the unsent Gmail draft in the pane for this lease and cycle without recording a send (FV-50, FV-69, FV-70, FV-84)", async () => {
      const start = manualFixture({ owner: "approved_terms", done: ["owner_outreach"] });
      const posts: (Record<string, unknown> | null)[] = [];
      const routes = stubRenewalRoutes(start, {
        messagePreparation: (channel, cycleId) => readyPreparation(channel, cycleId),
        messagePost: (body) => {
          posts.push(body);
          return Response.json(body?.confirm ? CREATED : PREVIEW);
        },
      });
      const user = userEvent.setup();
      await renderWorkspace({ manual: start });
      await openFocus(user);
      expect(heading()).toHaveTextContent(MANUAL_ACTIVITIES.tenant_offer.label);
      const card = document.getElementById("renewal-card-message-tenant")!;
      expect(card).toBeVisible();
      // The editor was read for this lease and channel, bound to the selected cycle.
      const read = routes.calls.find(
        (call: FetchCall) =>
          call.method === "GET" &&
          call.url.includes("/api/lease-renewal/message-preparation") &&
          call.url.includes("channel=tenant"),
      )!;
      expect(read.url).toContain("leaseId=lease-318-cedar-7");
      const preview = await within(card).findByRole("button", {
        name: "Preview unsent Gmail draft",
      });
      expect(preview).toBeEnabled();
      await user.click(preview);
      await user.click(
        await within(card).findByRole("button", { name: "Review creation confirmation" }),
      );
      await user.click(
        within(card).getByRole("button", { name: "Create this unsent draft" }),
      );
      await settle();
      expect(posts).toHaveLength(2);
      expect(posts[0]).toMatchObject({
        kind: "draft",
        leaseId: "lease-318-cedar-7",
        channel: "tenant",
      });
      expect(posts[1]).toMatchObject({
        kind: "draft",
        leaseId: "lease-318-cedar-7",
        channel: "tenant",
        confirm: { executionId: PREVIEW.executionId, previewHash: PREVIEW.previewHash },
      });
      expect(within(card).getByText(/A person sends from Gmail/)).toBeVisible();

      // Opening Gmail and coming back records nothing: the offer is still outstanding staff work.
      await act(async () => {
        window.dispatchEvent(new Event("blur"));
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
        await settle();
      });
      expect(heading()).toHaveTextContent(MANUAL_ACTIVITIES.tenant_offer.label);
      expect(within(focusPane()).getByText("Ready for you.")).toBeVisible();
      expect(workspaceWrites(routes)).toEqual([]);
      expect(routes.state()!.activities.tenant_offer).toBeUndefined();
    });
  },
);

const TEMPLATE = {
  ref: "tenant-renewal:v2.0",
  version: "v2.0",
  contentHash: "b".repeat(64),
  status: "approved",
};
const PREVIEW = {
  status: "preview",
  channel: "tenant",
  recipient: { to: "tenant@fixture.invalid", sourceRef: "rentvine:lease:fixture" },
  subject: "Lease Renewal for 318 Cedar Street, Unit 7",
  body: "Fixture reviewed body",
  executionId: `exec_${"a".repeat(40)}`,
  previewHash: "a".repeat(64),
  template: TEMPLATE,
};
const CREATED = {
  status: "created",
  channel: "tenant",
  recipient: PREVIEW.recipient,
  subject: PREVIEW.subject,
  executionId: PREVIEW.executionId,
  draftId: "fixture-draft-1",
  template: TEMPLATE,
};

/** A reviewed, complete and publishable preparation (fixture values only). */
function readyPreparation(channel: "owner" | "tenant", cycleId: string | null) {
  const base = emptyMessagePreparationInputs();
  const inputs = {
    ...base,
    signature: {
      name: "Fixture Staff",
      role: null,
      phone: null,
      hours: null,
      website: null,
      source: "reviewed:staff",
    },
    leaseOrigin: { kind: "pmi" as const, source: "reviewed:lease" },
    charges: base.charges.map((charge) => ({
      ...charge,
      applicable: false,
      source: "reviewed:charges",
    })),
  };
  return {
    senderEmail: "fixture-staff@pmikcmetro.com",
    cycleId,
    saved: { revision: 1, inputs, signatureEmail: "fixture-staff@pmikcmetro.com" },
    inputs,
    facts: {
      channel,
      names: [channel === "owner" ? "Fixture Owner" : "Fixture Tenant"],
      address: "318 Cedar Street, Unit 7",
      currentBaseRent: null,
      leaseEndDate: "2026-12-31",
      ownerTerms: {
        rent: 1450,
        effectiveDate: "2027-01-01",
        endDate: "2027-12-31",
        source: "staff:reviewed-owner-terms",
      },
      range: null,
      suggestedRent: null,
      comps: [],
      trend: null,
      sparseCompsQualification: null,
      charges: inputs.charges,
      insuranceTransition: null,
      leaseOrigin: inputs.leaseOrigin,
      otherChargesComparison: null,
      informationForm: { url: "https://example.invalid/form", source: "reviewed:form" },
      insuranceFlyer: null,
      rbpFlyer: null,
      signature: null,
      attachments: [],
    },
    sourceFingerprint: "a".repeat(64),
    needsReview: false,
    signatureMatchesActor: true,
    publication: { status: "approved" },
    notices: [],
    draftAttempt: null,
    previousDraftAttempts: [],
  };
}

function datesProposal(leaseId: string): RentvineWritebackClientProposal {
  return {
    lease_id: leaseId,
    account: "pmikcmetro",
    actor_uid: "editor-1",
    actor_email: "editor@pmikcmetro.com",
    lease_state: {
      startDate: "2025-09-01",
      endDate: "2026-08-31",
      increaseEligibilityDate: null,
    },
    source_read_at: "2026-09-30T12:00:00.000Z",
    evidence_ref: `workspace:${leaseId}`,
    preview_hash: "c".repeat(64),
    created_at: "2026-09-30T12:00:00.000Z",
    confirmation_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    effects: [
      {
        index: 0,
        action_key: "rentvine.lease.renewal_dates.update",
        kind: "renewal_dates_update",
        effect_hash: "d".repeat(64),
        effect: {
          kind: "renewal_dates_update",
          before: {
            startDate: "2025-09-01",
            endDate: "2026-08-31",
            increaseEligibilityDate: null,
          },
          after: { endDate: "2027-08-31" },
        },
        reversal_kind: "restore_dates",
      },
    ],
  };
}

function statusFor(
  proposal: RentvineWritebackClientProposal,
  state: string,
): RentvineWritebackEffectStatus[] {
  return proposal.effects.map((effect) => ({
    ...effect,
    execution_id: `s97:${proposal.lease_id}:${effect.effect_hash}`,
    state,
    attempt_count: state === "not_started" ? 0 : 1,
    reversal_state: null,
  }));
}
