import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  projectRenewalStage,
  type RenewalStageContext,
} from "@/lib/lease-renewal/renewal-stage";
import type { RenewalWorkspaceAction } from "@/lib/lease-renewal/workspace-state";
import { recordedState } from "@/tests/helpers/outreach-evidence-fixtures";

// S252 (L53): the one-path journey took a prepared lease to Complete and found that once the
// tenant accepted, the Now card named "Send the tenant offer" again while the staff lane's next
// activity was the renewal information form. Synthetic lease and records only.

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

// A standing agreement covers Ask the owner, so the records start at the tenant offer.
const CONTEXT: RenewalStageContext = {
  leaseId: "4801",
  staffRecordUnavailable: false,
  standingAgreement: { label: "Example standing agreement", reason: "Covered." },
  housingAssistance: null,
  numbers: { verified: true, openDifferences: 0 },
  term: { monthToMonth: false, reviewNeeded: false },
  moveOutInitiated: false,
  sourceRenewal: null,
  verification: null,
  handStatus: null,
  lastContactAtIso: null,
  threadCheck: null,
  outreach: null,
};

const at = (minute: number) => `2026-11-06T15:${String(minute).padStart(2, "0")}:00.000Z`;
const activity = (
  key: "tenant_offer" | "information_form" | "form_returned",
  outcome: "done" | "not_applicable",
): RenewalWorkspaceAction => ({ kind: "activity", activity: key, outcome });
const ACCEPTED: RenewalWorkspaceAction = { kind: "tenant_response", outcome: "accepted" };

function stageAfter(actions: readonly RenewalWorkspaceAction[]) {
  const state = recordedState(
    "4801",
    actions.map((action, index) => ({ action, atIso: at(index + 1) })),
  );
  return projectRenewalStage(state, CONTEXT, { standingCovered: true });
}

describe("S252 L53: after the tenant accepts, the information form is the one next step", () => {
  it("names Send the renewal information form at its staff record, never the tenant offer again", () => {
    const stage = stageAfter([activity("tenant_offer", "done"), ACCEPTED]);
    expect(stage.currentStepId).toBe("offer-tenant");
    expect(stage.nextStep.label).toBe("Send the renewal information form");
    const step = stage.steps.find((entry) => entry.id === "offer-tenant");
    expect(step).toMatchObject({
      state: "current",
      primary: {
        label: "Send the renewal information form",
        target: "renewal-manual-information_form",
      },
    });
    expect(stage.nextStep.label).not.toBe("Send the tenant offer");
  });

  it("with the form sent, names Record the returned information form", () => {
    const stage = stageAfter([
      activity("tenant_offer", "done"),
      ACCEPTED,
      activity("information_form", "done"),
    ]);
    expect(stage.currentStepId).toBe("offer-tenant");
    expect(stage.nextStep.label).toBe("Record the returned information form");
    expect(stage.steps.find((entry) => entry.id === "offer-tenant")?.primary).toEqual({
      label: "Record the returned information form",
      target: "renewal-manual-form_returned",
    });
  });

  it("with the form returned, or not part of this lease, Offer the tenant is done and Documents follows", () => {
    for (const outcome of ["done", "not_applicable"] as const) {
      const stage = stageAfter([
        activity("tenant_offer", "done"),
        ACCEPTED,
        activity("information_form", outcome),
        activity("form_returned", outcome),
      ]);
      expect(
        stage.steps.find((entry) => entry.id === "offer-tenant")?.state,
        outcome,
      ).toBe("done");
      expect(stage.currentStepId, outcome).toBe("documents");
      expect(stage.nextStep.label, outcome).toBe("Prepare the required documents");
    }
  });

  it("before the tenant answers, the step still waits on the tenant's response", () => {
    const stage = stageAfter([activity("tenant_offer", "done")]);
    expect(stage.currentStepId).toBe("offer-tenant");
    expect(stage.steps.find((entry) => entry.id === "offer-tenant")?.state).toBe(
      "waiting",
    );
    expect(stage.nextStep.label).toBe("Record tenant response");
  });
});
