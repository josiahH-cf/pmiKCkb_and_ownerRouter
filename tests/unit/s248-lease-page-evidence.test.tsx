// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { staffLaneGuidance } from "@/lib/lease-renewal/desk-guidance";
import {
  outreachFillFor,
  type LeaseOutreachEvidenceInput,
} from "@/lib/lease-renewal/outreach-evidence";
import { renewalStageContextFor } from "@/lib/lease-renewal/renewal-stage-context";
import {
  RENEWAL_FINISH_UP_WORDS,
  RENEWAL_STAGE_NEXT_STEP,
} from "@/lib/lease-renewal/renewal-stage";
import {
  emptyRenewalWorkspace,
  manualRenewalSummary,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { renderWorkspace, stubRenewalRoutes } from "@/tests/helpers/focus-workspace";
import {
  SENT_AT_MS,
  evidenceInput,
  message,
} from "@/tests/helpers/outreach-evidence-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S248 on the lease page, in every view (BEH-S248-1, S232): the app's own evidence is read into
// the staff lane the same way the desk row reads it, so Focus view and Full view name the same
// next task as the desk; "Needs a check" settles at the staff record and never offers a new send;
// a scheduled message offers nothing to send again; Finish up lists a verified receipt in its own
// words. Synthetic records only.

const LEASE = "lease-318-cedar-7";
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const PINNED_NOW = new Date("2026-11-05T17:00:00.000Z");
const LEASE_PATH = `/lease-renewal/live/desk/lease/${LEASE}`;
const HOUR = 3_600_000;

function record(
  actions: readonly { action: RenewalWorkspaceAction; atMs: number }[] = [],
): RenewalWorkspaceState {
  let state = emptyRenewalWorkspace(LEASE, CYCLE_ID, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
  for (const [index, { action, atMs }] of actions.entries())
    state = planRenewalWorkspaceAction(state, action, {
      actorUid: "synthetic-operator",
      recordedAt: new Date(atMs).toISOString(),
      eventId: `5d1c2b3a-4e5f-4a6b-8c7d-${String(index).padStart(12, "0")}`,
    });
  return state;
}

/** The sample lease's workspace with the live page's stage context and this evidence. */
function workspaceWith(outreach: LeaseOutreachEvidenceInput) {
  const base = getRenewalLeaseWorkspace(LEASE)!;
  return {
    ...base,
    renewalStageContext: {
      ...renewalStageContextFor(
        { ...base.summary, guidance: base.guidance },
        outreach,
        null,
      ),
      cycleDateIso: "2026-12-31",
    },
  };
}

const accepted = () => evidenceInput([message({ cycleId: CYCLE_ID })]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  router.refresh.mockClear();
  window.history.replaceState(null, "", LEASE_PATH);
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function nowCard() {
  return within(screen.getByRole("region", { name: "Guided view" })).getByRole("region", {
    name: "Now",
  });
}

describe(
  "S248 the lease page reads the app's evidence in every view",
  { timeout: 120_000 },
  () => {
    it("Focus view reads an accepted send as the outreach, with the desk row's status", async () => {
      // The same record with the outreach recorded by staff: what Focus names then.
      const recorded = record([
        {
          action: { kind: "activity", activity: "owner_outreach", outcome: "done" },
          atMs: SENT_AT_MS,
        },
      ]);
      stubRenewalRoutes(recorded);
      await renderWorkspace({
        manual: recorded,
        view: "focus",
        workspace: workspaceWith(evidenceInput([])),
      });
      const byStaff = screen
        .getByRole("region", { name: "Focus view" })
        .getAttribute("data-renewal-focus-action");
      expect(byStaff).not.toBe("manual.owner_outreach");
      cleanup();
      window.sessionStorage.clear();
      // No staff entry, and the app's own accepted owner message.
      const manual = record();
      stubRenewalRoutes(manual);
      await renderWorkspace({
        manual,
        view: "focus",
        workspace: workspaceWith(accepted()),
      });
      const pane = screen.getByRole("region", { name: "Focus view" });
      expect(pane).toHaveAttribute("data-renewal-focus-action", byStaff!);
      // The desk row's status for the same record and evidence.
      const desk = staffLaneGuidance(
        manualRenewalSummary(manual, {
          evidence: outreachFillFor(manual, {
            input: accepted(),
            cycleDateIso: "2026-12-31",
          }),
        }),
      ).status;
      expect(
        within(pane)
          .getByText(/Lease status:/)
          .closest("[data-lease-status]"),
      ).toHaveAttribute("data-lease-status", desk);
    });

    it("Full view's recorded work card suggests the owner's response after an accepted send", async () => {
      const manual = record();
      stubRenewalRoutes(manual);
      await renderWorkspace({
        manual,
        view: "full",
        workspace: workspaceWith(accepted()),
      });
      const card = document.getElementById("renewal-card-manual-records")!;
      expect(
        within(card).getByRole("link", { name: /^Suggested next:/ }),
      ).toHaveAttribute("href", "#renewal-manual-owner_response");
    });

    it("Needs a check makes settling the check the Now card's one primary action, never a send", async () => {
      const manual = record([
        {
          action: { kind: "activity", activity: "owner_outreach", outcome: "waiting" },
          atMs: SENT_AT_MS + HOUR,
        },
      ]);
      stubRenewalRoutes(manual);
      await renderWorkspace({
        manual,
        view: "default",
        workspace: workspaceWith(accepted()),
      });
      const card = nowCard();
      const primary = card.querySelector("[data-renewal-now-primary]")!;
      expect(primary).toHaveTextContent(RENEWAL_STAGE_NEXT_STEP.settleCheck);
      // S279 R-S279-3 (rewritten on purpose): the check reads once on the screen, in the stage
      // line with its fix; the Now card's primary action settles it.
      const stageLine = document.querySelector('[data-renewal-field="stage-line"]')!;
      expect(stageLine.textContent).toMatch(/^Needs a check: The staff record/);
      expect(within(card).queryByText(/Needs a check: The staff record/)).toBeNull();
      expect(
        [...document.body.querySelectorAll("p, span, li")].filter((node) =>
          (node.textContent ?? "").startsWith("Needs a check: The staff record"),
        ),
      ).toHaveLength(1);
      expect(
        within(card).queryByRole("button", { name: /Send the owner message/ }),
      ).toBeNull();
    });

    it("a scheduled first message offers neither Send again nor Record what happened", async () => {
      const manual = record();
      stubRenewalRoutes(manual);
      const scheduled = evidenceInput([
        message({
          cycleId: CYCLE_ID,
          acceptedAtMs: null,
          scheduledForMs: SENT_AT_MS + 24 * HOUR,
        }),
      ]);
      await renderWorkspace({
        manual,
        view: "default",
        workspace: workspaceWith(scheduled),
      });
      const card = nowCard();
      expect(card).toHaveAttribute("data-renewal-now-step", "ask-owner");
      expect(within(card).getByText(/^Owner message scheduled for /)).toBeVisible();
      expect(card.querySelector("[data-renewal-now-primary]")).toHaveTextContent(
        "Review the scheduled owner message",
      );
      expect(within(card).queryByRole("button", { name: "Send again" })).toBeNull();
      expect(
        within(card).queryByRole("button", { name: "Record what happened" }),
      ).toBeNull();
    });

    it("Finish up lists a verified receipt in its own words beside the staff-recorded follow-ups", async () => {
      const recorded = record([
        {
          action: { kind: "activity", activity: "insurance", outcome: "done" },
          atMs: SENT_AT_MS,
        },
      ]);
      const field = Object.keys(recorded.sourceUpdates)[0]!;
      const manual: RenewalWorkspaceState = {
        ...recorded,
        sourceUpdates: {
          [field]: { ...recorded.sourceUpdates[field]!, state: "verified" },
        },
      };
      stubRenewalRoutes(manual);
      await renderWorkspace({
        manual,
        view: "default",
        workspace: workspaceWith(evidenceInput([])),
        extra: { selectedStepId: "finish-up" },
      });
      const items = within(nowCard()).getByRole("list", { name: "Finish up items" });
      const sheet = items.querySelector(
        `[data-renewal-finish-up-item="sheet:${field}"]`,
      )!;
      expect(sheet).toHaveAttribute("data-renewal-finish-up-origin", "provider_verified");
      expect(sheet).toHaveTextContent(RENEWAL_FINISH_UP_WORDS.providerVerified);
      const followUp = items.querySelector(
        '[data-renewal-finish-up-item="follow-up:insurance"]',
      )!;
      expect(followUp).toHaveAttribute("data-renewal-finish-up-origin", "staff");
      expect(followUp).toHaveTextContent(RENEWAL_FINISH_UP_WORDS.staff);
    });
  },
);
