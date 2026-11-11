// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { renewalStageContextFor } from "@/lib/lease-renewal/renewal-stage-context";
import { RENEWAL_STAGE_NEXT_STEP } from "@/lib/lease-renewal/renewal-stage";
import {
  OWNER_DECISION_AFTER_REPLY_LABEL,
  emptyRenewalWorkspace,
} from "@/lib/lease-renewal/workspace-state";
import {
  renderWorkspace,
  settle,
  stubRenewalRoutes,
  viewButton,
} from "@/tests/helpers/focus-workspace";
import { SYNTHETIC_APPROVAL_CHOICES } from "@/tests/helpers/owner-approval-form";
import {
  REPLY_AT_MS,
  evidenceInput,
  message,
} from "@/tests/helpers/outreach-evidence-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S271 N10-02 found this on the guarded rehearsal: the owner replied to an earlier message, a later
// owner send's result is unknown, and Guided cued "The last owner message is not confirmed yet."
// while its one primary recorded the owner's decision; Check whether the message went out was not
// offered in either view. S269 rule 2 (AC-S269-1, both views): the same attempt leads ahead of the
// observed reply, which stays recordable through the Owner response in Full view. Synthetic values.

const LEASE = "lease-318-cedar-7";
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";

const manual = () =>
  emptyRenewalWorkspace(LEASE, CYCLE_ID, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });

const replied = message({ cycleId: CYCLE_ID, replyAtMs: REPLY_AT_MS });
const uncertain = message({
  cycleId: CYCLE_ID,
  acceptedAtMs: null,
  unconfirmed: true,
  createdAtMs: REPLY_AT_MS + 3_600_000,
});

function workspace() {
  const base = getRenewalLeaseWorkspace(LEASE)!;
  return {
    ...base,
    live: {
      leaseId: LEASE,
      ownerDecision: null,
      ownerDecisionCurrent: false,
      ownerOutcome: null,
      ownerResponseRecordable: false,
      tenantOfferDraftId: null,
      tenantOutcome: null,
      processVersion: base.process.version,
      complete: false,
    },
    renewalStageContext: {
      ...renewalStageContextFor(
        { ...base.summary, guidance: base.guidance },
        evidenceInput([replied, uncertain]),
        null,
      ),
      cycleDateIso: "2026-12-31",
    },
  };
}

function routes() {
  return stubRenewalRoutes(manual(), {
    other({ url }) {
      if (url.includes("/api/lease-renewal/notice-review"))
        return Response.json({
          disposition: { state: "not_initiated", label: "No move-out notice recorded." },
          ready: false,
        });
      if (url.includes("/api/lease-renewal/notice-timing-basis"))
        return Response.json({
          timingBasis: { state: "missing", record: null },
          canSelect: false,
        });
      return null;
    },
  });
}

async function open() {
  const fake = routes();
  await renderWorkspace({
    manual: manual(),
    view: "default",
    workspace: workspace(),
    extra: {
      ownerApprovalChoices: {
        ...SYNTHETIC_APPROVAL_CHOICES,
        replies: [
          {
            sequenceId: replied.sequenceId,
            evidenceId: "owner-mailbox:reply-1",
            senderEmail: "renewals@example.invalid",
            receivedAt: new Date(REPLY_AT_MS).toISOString(),
          },
        ],
      },
    },
  });
  await settle();
  return fake;
}

function nowCard() {
  return within(screen.getByRole("region", { name: "Guided view" })).getByRole("region", {
    name: "Now",
  });
}

const reconciles = (fake: ReturnType<typeof routes>) =>
  fake
    .writes()
    .filter(
      (call) =>
        call.url.includes("/api/gmail-hub/sequences") &&
        call.body?.action === "reconcile",
    );

beforeEach(() => {
  router.refresh.mockClear();
  window.history.replaceState(null, "", `/lease-renewal/live/desk/lease/${LEASE}`);
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe(
  "S271 N10-02: an unresolved owner send leads ahead of an earlier reply",
  { timeout: 120_000 },
  () => {
    it("Guided: the check on the same attempt is the one primary and the reply decision waits", async () => {
      const fake = await open();
      expect(nowCard()).toHaveAttribute("data-renewal-now-step", "ask-owner");
      const work = nowCard().querySelector<HTMLElement>("[data-renewal-work]")!;
      expect(work).toHaveAttribute("data-renewal-priority-state", "reconcile");
      expect(work).toHaveTextContent("The last owner message is not confirmed yet.");
      const primary = nowCard().querySelector<HTMLElement>("[data-renewal-now-primary]")!;
      expect(primary).toHaveTextContent(RENEWAL_STAGE_NEXT_STEP.checkSend);
      expect(
        within(nowCard()).queryByRole("button", {
          name: OWNER_DECISION_AFTER_REPLY_LABEL,
        }),
      ).toBeNull();
      expect(
        within(nowCard()).queryByRole("group", { name: "Record the owner's answer" }),
      ).toBeNull();
      await userEvent.setup().click(primary);
      await waitFor(() => expect(reconciles(fake)).toHaveLength(1));
      expect(reconciles(fake)[0]!.body).toEqual({
        action: "reconcile",
        id: uncertain.sequenceId,
      });
      expect(fake.writes()).toHaveLength(1);
    });

    it("Full: Ask the owner leads with the same check and its Owner response stays available", async () => {
      const fake = await open();
      const user = userEvent.setup();
      await user.click(viewButton("Full view"));
      await settle();
      const owner = document.querySelector<HTMLElement>(
        'section[data-renewal-outcome="ask-owner"]',
      )!;
      expect(owner).toHaveAttribute("data-renewal-work-state", "reconcile");
      const check = within(owner).getByRole("button", {
        name: RENEWAL_STAGE_NEXT_STEP.checkSend,
      });
      expect(
        within(owner).queryByRole("button", { name: OWNER_DECISION_AFTER_REPLY_LABEL }),
      ).toBeNull();
      // The observed reply is still recorded through its own owner, the Owner response.
      expect(document.getElementById("renewal-manual-owner_response")).not.toBeNull();
      await user.click(check);
      await waitFor(() => expect(reconciles(fake)).toHaveLength(1));
      expect(reconciles(fake)[0]!.body).toEqual({
        action: "reconcile",
        id: uncertain.sequenceId,
      });
      expect(fake.writes()).toHaveLength(1);
    });
  },
);
