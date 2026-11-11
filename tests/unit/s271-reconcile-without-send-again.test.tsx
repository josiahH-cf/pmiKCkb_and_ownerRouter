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

import { renewalStageContextFor } from "@/lib/lease-renewal/renewal-stage-context";
import { RENEWAL_STAGE_NEXT_STEP } from "@/lib/lease-renewal/renewal-stage";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import {
  renderWorkspace,
  settle,
  stubRenewalRoutes,
} from "@/tests/helpers/focus-workspace";
import {
  SENT_AT_MS,
  evidenceInput,
  message,
} from "@/tests/helpers/outreach-evidence-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S271 N10-05 found this on the guarded rehearsal: the tenant offer went out, a later send of it
// has an unknown result, and Guided led with "Check whether the message went out" while its
// secondary row still offered "Send again" for the same message. S269 rule 2 and R-S265-3: the
// unresolved attempt's own check comes first and nothing offers another send until it is
// settled. Waiting with no unresolved attempt keeps "Send again". Synthetic values.

const LEASE = "lease-318-cedar-7";
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";

const manual = () =>
  emptyRenewalWorkspace(LEASE, CYCLE_ID, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });

const sent = message({ cycleId: CYCLE_ID });
const uncertain = message({
  cycleId: CYCLE_ID,
  acceptedAtMs: null,
  unconfirmed: true,
  createdAtMs: SENT_AT_MS + 3_600_000,
});

function workspace(messages: readonly ReturnType<typeof message>[]) {
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
        evidenceInput(messages),
        null,
      ),
      cycleDateIso: "2026-12-31",
    },
  };
}

async function open(messages: readonly ReturnType<typeof message>[]) {
  stubRenewalRoutes(manual(), {
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
  await renderWorkspace({
    manual: manual(),
    view: "default",
    workspace: workspace(messages),
  });
  await settle();
}

function nowCard() {
  return within(screen.getByRole("region", { name: "Guided view" })).getByRole("region", {
    name: "Now",
  });
}

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
  "S271 N10-05: an unresolved send is settled before another send is offered",
  { timeout: 120_000 },
  () => {
    it("waiting with an unresolved attempt leads with its check and offers no Send again", async () => {
      await open([sent, uncertain]);
      const work = nowCard().querySelector<HTMLElement>("[data-renewal-work]")!;
      expect(work).toHaveAttribute("data-renewal-priority-state", "reconcile");
      expect(
        nowCard().querySelector<HTMLElement>("[data-renewal-now-primary]"),
      ).toHaveTextContent(RENEWAL_STAGE_NEXT_STEP.checkSend);
      expect(within(nowCard()).queryByRole("button", { name: "Send again" })).toBeNull();
    });

    it("waiting with every send settled keeps Send again", async () => {
      await open([sent]);
      expect(
        within(nowCard()).getByRole("button", { name: "Send again" }),
      ).toBeInTheDocument();
    });
  },
);
