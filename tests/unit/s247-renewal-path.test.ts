import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NOT_PART_OF_PATH_LABEL,
  RENEWAL_PATH_DEFINITION,
  RENEWAL_PATH_LABELS,
  RENEWAL_PATH_STANDARD_STEPS,
  pathStepForLinkStep,
  renewalPathSteps,
} from "@/lib/lease-renewal/renewal-path";
import {
  projectRenewalStage,
  type RenewalStageContext,
} from "@/lib/lease-renewal/renewal-stage";
import { RENEWAL_WORK_STATUSES, RENEWAL_WORK_STATUS_LABELS } from "@/lib/lease-renewal/work-status";
import { RENEWAL_PROCESS_DEFINITION } from "@/lib/lease-renewal/renewal-process";
import { renewalBatchRowStage } from "@/lib/lease-renewal/renewal-batch-row";
import { projectRenewalRead } from "@/lib/operational-context/projections";
import { buildRenewalActionSnapshot } from "@/lib/lease-renewal/renewal-action-snapshot";
import { projectRenewalActions } from "@/lib/lease-renewal/renewal-actions";
import { projectRenewalIssues } from "@/lib/lease-renewal/renewal-issues";
import {
  S246_LEASES,
  loadS246Desk,
  loadS246Workspace,
  s246Manual,
  s246Row,
  type S246DeskOptions,
} from "@/tests/helpers/s246-portfolio";
import {
  EVIDENCE_CYCLE,
  REPLY_AT_MS,
  evidenceInput,
  message,
  recordedState,
} from "@/tests/helpers/outreach-evidence-fixtures";

// S247: one renewal path per lease and one stage projection read by the desk row, the lease page
// and the assistant. Synthetic leases only.

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const BASE_CONTEXT: RenewalStageContext = {
  leaseId: "4801",
  staffRecordUnavailable: false,
  standingAgreement: null,
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

describe("S247 R-S247-1: one ordered path definition", () => {
  it("names seven standard steps in order, each with its controls, handler and completion predicate", () => {
    expect(RENEWAL_PATH_STANDARD_STEPS.map((id) => RENEWAL_PATH_LABELS[id])).toEqual([
      "Check the numbers",
      "Compare market rent",
      "Ask the owner",
      "Offer the tenant",
      "Documents and signatures",
      "Finish up",
      "Complete",
    ]);
    const workStatuses: readonly string[] = RENEWAL_WORK_STATUSES;
    for (const [index, id] of RENEWAL_PATH_STANDARD_STEPS.entries()) {
      const step = RENEWAL_PATH_DEFINITION[id];
      expect(step.controls.length, id).toBeGreaterThan(0);
      expect(step.handlers.length, id).toBeGreaterThan(0);
      expect(step.handlers.every((route) => route.startsWith("/api/")), id).toBe(true);
      expect(step.primary.label.trim(), id).not.toBe("");
      expect(step.completion.trim(), id).not.toBe("");
      expect(step.ready.trim(), id).not.toBe("");
      expect(step.decides.trim(), id).not.toBe("");
      expect(workStatuses, id).toContain(step.stage);
      if (step.waitingStage) expect(workStatuses, id).toContain(step.waitingStage);
      expect(step.next, id).toBe(RENEWAL_PATH_STANDARD_STEPS[index + 1] ?? null);
    }
  });

  it("stage names reuse the eleven staff work-status labels", () => {
    const labels = new Set(Object.values(RENEWAL_WORK_STATUS_LABELS));
    const stage = projectRenewalStage(null, BASE_CONTEXT);
    expect(labels.has(stage.stage.label)).toBe(true);
    expect(Object.keys(RENEWAL_WORK_STATUS_LABELS)).toHaveLength(11);
  });

  it("R-S247-11: every older step value names the path step that holds its controls", () => {
    const steps = RENEWAL_PROCESS_DEFINITION.steps.map((step) => step.id);
    expect(Object.fromEntries(steps.map((id) => [id, pathStepForLinkStep(id)]))).toEqual({
      "verify-renewal": "check-numbers",
      "owner-decision": "ask-owner",
      "tenant-decision": "offer-tenant",
      "document-packet": "documents",
      "signatures-follow-up": "documents",
      "compliance-close": "finish-up",
    });
    expect(pathStepForLinkStep("ask-owner")).toBe("ask-owner");
    expect(pathStepForLinkStep("unknown")).toBeNull();
    expect(pathStepForLinkStep(undefined)).toBeNull();
  });
});

describe("S247 R-S247-2: variants are slots in the definition", () => {
  const ids = (variants: Parameters<typeof renewalPathSteps>[0]) =>
    renewalPathSteps(variants).map((step) => `${step.id}${step.applies ? "" : " (not part)"}`);
  const standard = {
    nonRenewal: null,
    monthToMonth: false,
    standingAgreement: null,
    housingAssistance: null,
  };

  it("a recorded non-renewal replaces the later steps with the existing handoff", () => {
    expect(ids({ ...standard, nonRenewal: { source: "recorded" } })).toEqual([
      "check-numbers",
      "compare-market",
      "ask-owner",
      "offer-tenant",
      "non-renewal-handoff",
      "documents (not part)",
      "finish-up (not part)",
      "complete",
    ]);
    const stage = projectRenewalStage(
      recordedState("4801", [
        {
          action: { kind: "owner_response", outcome: "declined_non_renewal" },
          atIso: "2026-11-04T16:00:00.000Z",
        },
      ]),
      BASE_CONTEXT,
    );
    expect(stage.currentStepId).toBe("non-renewal-handoff");
    expect(stage.stage.label).toBe("Non-renewal handoff");
    expect(stage.steps.find((step) => step.id === "documents")).toMatchObject({
      state: "not_part",
      detail: NOT_PART_OF_PATH_LABEL,
      primary: null,
    });
  });

  it("a RentVine move-out notice goes to the handoff without an offer step", () => {
    const stage = projectRenewalStage(null, { ...BASE_CONTEXT, moveOutInitiated: true });
    expect(stage.currentStepId).toBe("non-renewal-handoff");
    expect(stage.steps.find((step) => step.id === "offer-tenant")?.state).toBe("not_part");
  });

  it("a month-to-month lease shows its review step first", () => {
    expect(ids({ ...standard, monthToMonth: true })[0]).toBe("month-to-month-review");
    const stage = projectRenewalStage(null, {
      ...BASE_CONTEXT,
      term: { monthToMonth: true, reviewNeeded: true },
    });
    expect(stage.currentStepId).toBe("month-to-month-review");
  });

  it("the standing agreement slot (S250) covers Ask the owner and the path continues", () => {
    const stage = projectRenewalStage(
      null,
      {
        ...BASE_CONTEXT,
        standingAgreement: { label: null, reason: "Standing owner authority covers this lease." },
      },
      { standingCovered: true },
    );
    expect(stage.steps.find((step) => step.id === "ask-owner")).toMatchObject({
      state: "covered",
      primary: null,
    });
    expect(stage.currentStepId).toBe("offer-tenant");
  });

  it("the housing assistance slot (S251) puts the program and the owner's answer ahead of rent", () => {
    expect(ids({ ...standard, housingAssistance: { program: "Sample Program" } })).toEqual([
      "check-numbers",
      "assisted-program-contact",
      "assisted-owner-renewal-answer",
      "assisted-rent",
      "compare-market (not part)",
      "ask-owner (not part)",
      "offer-tenant",
      "documents",
      "finish-up",
      "complete",
    ]);
  });
});

describe("S247 BEH-S247-1 / ARCH-S247-3: the first applicable step, nothing gated", () => {
  it("with nothing recorded, the first open step is current and every later step stays workable", () => {
    const unverified = projectRenewalStage(null, {
      ...BASE_CONTEXT,
      numbers: { verified: false, openDifferences: 1 },
    });
    expect(unverified.currentStepId).toBe("check-numbers");
    expect(unverified.stage.label).toBe("Verifying lease and rent");
    expect(unverified.steps.find((step) => step.id === "check-numbers")?.detail).toBe(
      "One difference to settle",
    );
    const agreed = projectRenewalStage(null, BASE_CONTEXT);
    expect(agreed.currentStepId).toBe("compare-market");
    expect(agreed.nextStep.label).toBe("Compare market rent");
    // Every path step offers its primary action; none is held back by order.
    for (const step of agreed.steps.filter((entry) => entry.state !== "done"))
      expect(step.primary, step.id).not.toBeNull();
  });

  it("the projection stores nothing: the same inputs always give the same stage", () => {
    const state = recordedState("4801");
    const input = { ...BASE_CONTEXT, outreach: evidenceInput([message()]) };
    expect(projectRenewalStage(state, input)).toEqual(projectRenewalStage(state, input));
  });
});

describe("S247 R-S247-5: a waiting step says who, since when, the last contact and what is watched", () => {
  it("an accepted owner message waits on the owner since the send", () => {
    const stage = projectRenewalStage(recordedState("4801"), {
      ...BASE_CONTEXT,
      outreach: evidenceInput([message()]),
    });
    expect(stage.stage.label).toBe("Waiting on owner response");
    expect(stage.stageLine).toBe("Waiting on owner response since 11/04/2026");
    expect(stage.waiting).toMatchObject({ party: "the owner" });
    expect(stage.waiting?.watching).toContain("Replies and delivery reports");
    expect(stage.steps.find((step) => step.id === "ask-owner")?.state).toBe("waiting");
    expect(stage.derived).toHaveLength(1);
  });

  it("a reply names the decision as the one next step", () => {
    const stage = projectRenewalStage(recordedState("4801"), {
      ...BASE_CONTEXT,
      outreach: evidenceInput([message({ replyAtMs: REPLY_AT_MS })]),
    });
    expect(stage.nextStep.label).toBe("Record the owner's decision");
    expect(stage.evidenceLine).toBe("Owner replied 11/05/2026");
  });
});

describe("S247 R-S247-8: a hand-set status that differs from the stage shows both", () => {
  it("names the hand-set status and the derived stage in one line", () => {
    const stage = projectRenewalStage(null, {
      ...BASE_CONTEXT,
      handStatus: { key: "preparing_tenant_offer", label: "Preparing tenant offer" },
    });
    expect(stage.handStatusLine).toBe(
      "Set by hand: Preparing tenant offer. From the recorded work: Preparing market comparison.",
    );
  });
});

describe("S247 ARCH-S247-1 / BEH-S247-4 / AC-S247-1: one stage on the desk row, the lease page and the assistant", () => {
  const MANUAL_101 = recordedState(S246_LEASES.activeInMonth, [], EVIDENCE_CYCLE);
  const MANUAL_102 = recordedState(S246_LEASES.activeInMonthSecond, [
    {
      action: { kind: "activity", activity: "owner_outreach", outcome: "done" },
      atIso: "2026-11-03T15:00:00.000Z",
    },
  ]);
  const options: S246DeskOptions = {
    manual: new Map([
      ...s246Manual(),
      [S246_LEASES.activeInMonth, MANUAL_101],
      [S246_LEASES.activeInMonthSecond, MANUAL_102],
    ]),
    outreach: new Map([
      [
        S246_LEASES.activeInMonth,
        evidenceInput([message({ replyAtMs: REPLY_AT_MS })]),
      ],
    ]),
  };

  it("the three earlier next-step sources disagree, yet every surface names one stage and one next step", async () => {
    const view = await loadS246Desk(options);
    for (const leaseId of [
      S246_LEASES.activeInMonth,
      S246_LEASES.activeInMonthSecond,
      S246_LEASES.activeLater,
      S246_LEASES.endedWithoutOutcome,
    ]) {
      const row = s246Row(view, leaseId);
      const workspace = await loadS246Workspace(leaseId, options);
      // The earlier sources: the staff summary, the desk guidance and the Focus action graph.
      const issues = projectRenewalIssues({
        guidance: workspace.guidance,
        summary: workspace.summary,
        readComplete: true,
        currencyState: "fresh" as const,
        progressStateAvailable: true,
      });
      const snapshot = buildRenewalActionSnapshot({
        workspace,
        role: "Editor",
        issues,
        manualLaneMounted: true,
        manualState: options.manual!.get(leaseId) ?? null,
        manualReadUnavailable: false,
        unavailableSources: new Set(),
        rentChargeStatus: null,
        correctionPanel: true,
      });
      const focus = projectRenewalActions(snapshot);
      const sources = new Set([
        row.manualProgress?.nextActivity ?? "owner_outreach",
        "label" in row.guidance.action ? row.guidance.action.label : "",
        focus.primaryActionId ?? focus.headlineActionId ?? "",
      ]);
      if (leaseId === S246_LEASES.activeInMonth) expect(sources.size).toBe(3);
      // One stage and one next step everywhere.
      expect(row.renewalStage, leaseId).toBeDefined();
      expect(workspace.summary.renewalStage, leaseId).toEqual(row.renewalStage);
      const batch = renewalBatchRowStage(row, view.dataCurrency.readAtIso);
      expect(batch.stageLine).toBe(row.renewalStage!.stageLine);
      expect(batch.nextStep.label).toBe(row.renewalStage!.nextStep.label);
      const assistant = projectRenewalRead({
        status: "ok",
        rows: view.items,
        readComplete: true,
        dataCurrency: view.dataCurrency,
      }).records.find((record) => record.ref.id === leaseId)!;
      expect(assistant.facts).toMatchObject({
        stage: row.renewalStage!.stageLine,
        nextAction: row.renewalStage!.nextStep.label,
      });
      expect(assistant.detail).toContain(row.renewalStage!.stageLine);
      expect(assistant.detail).toContain(`Next step: ${row.renewalStage!.nextStep.label}`);
      expect(assistant.href).toContain(`step=${row.renewalStage!.nextStep.stepId}`);
    }
    const replied = s246Row(view, S246_LEASES.activeInMonth).renewalStage!;
    expect(replied.nextStep.label).toBe("Record the owner's decision");
    expect(replied.stageLine).toBe("Waiting on owner response: Owner replied 11/05/2026");
    const outreachDone = s246Row(view, S246_LEASES.activeInMonthSecond).renewalStage!;
    expect(outreachDone.stage.label).toBe("Waiting on owner response");
  });
});
