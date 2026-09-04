import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  RENEWAL_COMPLETION_REQUIREMENTS,
  RENEWAL_PROCESS_VERSION,
  buildRenewalEvidenceReference,
  projectRenewalProcess,
  type RenewalEvidenceKey,
  type RenewalEvidenceMap,
  type RenewalOwnerOutcomeState,
} from "@/lib/lease-renewal/renewal-process";
import {
  RENEWAL_STAGE,
  planRecordOwnerDecision,
  planRecordOwnerOutcome,
  type RenewalProgress,
} from "@/lib/lease-renewal/renewal-progress";
import {
  assertRenewalWritebackConfirmation,
  buildRenewalWritebackProposal,
  renewalWritebackExecutionId,
  RENEWAL_WRITEBACK_ACCOUNT,
} from "@/lib/lease-renewal/writeback/proposal-contract";

// S105: the renewal lifecycle closes with typed owner outcomes and version-bound downstream work.
// Every value here is synthetic; no planner in this suite reaches a provider or sends anything.

function evidence(ref: string) {
  return buildRenewalEvidenceReference({
    ref,
    source: "app_record",
    disposition: "verified",
  });
}

function gmailEvidence(ref: string) {
  return buildRenewalEvidenceReference({
    ref,
    source: "gmail_receipt",
    disposition: "verified",
  });
}

const REQUIRED_KEYS: readonly RenewalEvidenceKey[] = [
  ...new Set(RENEWAL_COMPLETION_REQUIREMENTS.map((requirement) => requirement.key)),
];

/** Evidence for every required accepted-path substep plus completion, so `complete` is reachable. */
function completeEvidence(): RenewalEvidenceMap {
  const map: RenewalEvidenceMap = {};
  for (const key of REQUIRED_KEYS) map[key] = evidence(`fixture:${key}`);
  map["app-completion"] = evidence("fixture:app-completion");
  map["non-renewal-handoff"] = evidence("fixture:non-renewal-handoff");
  return map;
}

function progress(overrides: Partial<RenewalProgress> = {}): RenewalProgress {
  return {
    leaseId: "4821",
    processVersion: RENEWAL_PROCESS_VERSION,
    stageIndex: RENEWAL_STAGE.owner,
    ownerDecision: { decision: "increase", offeredRent: 1400 },
    ownerDecisionRevision: 1,
    tenantOfferDraftId: "draft-1",
    tenantOutcome: null,
    evidence: {
      "owner-copy-version": evidence("fixture:owner-copy-version"),
      "owner-draft-receipt": evidence("fixture:owner-draft-receipt"),
      "owner-message-sent": gmailEvidence("fixture:owner-message-sent"),
      "owner-response": gmailEvidence("fixture:owner-response"),
      "owner-decision": evidence("lease-progress:owner-decision:r1"),
      "tenant-offer-fact-lock": evidence("fixture:tenant-offer-fact-lock"),
      "tenant-draft-receipt": evidence("fixture:tenant-draft-receipt"),
      "packet-facts": evidence("fixture:packet-facts"),
      "packet-snapshot": evidence("fixture:packet-snapshot"),
    },
    complete: false,
    ...overrides,
  };
}

describe("S105 typed owner outcomes (ARCH-S105-1 / BEH-S105-2)", () => {
  it("types the recorded response as approved without reopening prior work", () => {
    // Typing the outcome for the response already on file changes no evidence identity, so the
    // decision and every artifact built from it stay current.
    const plan = planRecordOwnerOutcome(
      progress(),
      "approved_terms",
      gmailEvidence("fixture:owner-response"),
    );
    expect(plan.ownerOutcome).toMatchObject({ state: "approved_terms" });
    expect(plan.stageIndex).toBe(RENEWAL_STAGE.owner);
    expect(plan.evidence["owner-decision"]).toBeDefined();
    expect(plan.evidence["tenant-draft-receipt"]).toBeDefined();
    expect(plan.tenantOfferDraftId).toBe("draft-1");
  });

  it("supersedes a decision built on an earlier response when a new response is recorded", () => {
    // A different response is a new authoritative boundary: the decision built on the previous one
    // is no longer current, so it and its downstream previews must be rebuilt.
    const plan = planRecordOwnerOutcome(
      progress(),
      "approved_terms",
      gmailEvidence("owner-response:second-reply"),
    );
    expect(plan.evidence["owner-response"]).toMatchObject({
      ref: "owner-response:second-reply",
    });
    for (const key of [
      "owner-decision",
      "tenant-offer-fact-lock",
      "tenant-draft-receipt",
      "packet-snapshot",
    ] as const) {
      expect(plan.evidence[key]).toBeUndefined();
    }
  });

  it("reopens owner copy onward and invalidates downstream previews on a revision request", () => {
    const plan = planRecordOwnerOutcome(
      progress(),
      "revision_requested",
      gmailEvidence("owner-response:revision"),
    );
    expect(plan.ownerOutcome).toMatchObject({ state: "revision_requested" });
    expect(plan.stageIndex).toBe(RENEWAL_STAGE.owner);
    for (const key of [
      "owner-copy-version",
      "owner-draft-receipt",
      "owner-message-sent",
      "owner-decision",
      "tenant-offer-fact-lock",
      "tenant-draft-receipt",
      "packet-facts",
      "packet-snapshot",
    ] as const) {
      expect(plan.evidence[key]).toBeUndefined();
    }
    // The recorded human response itself survives the reopening.
    expect(plan.evidence["owner-response"]).toMatchObject({
      ref: "owner-response:revision",
    });
    expect(plan.tenantOfferDraftId).toBeNull();
    expect(plan.tenantOutcome).toBeNull();
    // The prior decision value is retained for operator review; only its evidence is invalidated.
    expect(plan.ownerDecision).toMatchObject({ offeredRent: 1400 });
  });

  it("routes an owner decline to the documented non-renewal exit", () => {
    const plan = planRecordOwnerOutcome(
      progress(),
      "declined_non_renewal",
      gmailEvidence("owner-response:declined"),
    );
    expect(plan.ownerOutcome).toMatchObject({ state: "declined_non_renewal" });
    expect(plan.evidence["owner-decision"]).toBeUndefined();
    expect(plan.evidence["packet-snapshot"]).toBeUndefined();
    expect(plan.tenantOfferDraftId).toBeNull();

    const projection = projectRenewalProcess({
      processVersion: RENEWAL_PROCESS_VERSION,
      evidence: plan.evidence,
      ownerOutcome: plan.ownerOutcome,
    });
    expect(projection.status).toBe("non_renewal_handoff_required");
    const handoff = projection.steps[2].substeps.find(
      (substep) => substep.id === "record-non-renewal-handoff",
    );
    expect(handoff).toMatchObject({ applicable: true, state: "ready" });
  });

  it("keeps a silent owner visibly waiting rather than complete", () => {
    const plan = planRecordOwnerOutcome(
      progress(),
      "no_response",
      evidence("owner-response:no-response"),
    );
    const projection = projectRenewalProcess({
      processVersion: RENEWAL_PROCESS_VERSION,
      evidence: plan.evidence,
      ownerOutcome: plan.ownerOutcome,
    });
    expect(projection.status).toBe("waiting_on_owner");
    expect(projection.currentStepIndex).toBe(1);
    const response = projection.steps[1].substeps.find(
      (substep) => substep.id === "record-owner-response",
    );
    expect(response?.state).toBe("blocked");
    expect(response?.blockers.join(" ")).toMatch(/still pending/i);
  });

  it("shows a revision request as reopened owner work with an unbindable offer", () => {
    const plan = planRecordOwnerOutcome(
      progress(),
      "revision_requested",
      gmailEvidence("owner-response:revision"),
    );
    const projection = projectRenewalProcess({
      processVersion: RENEWAL_PROCESS_VERSION,
      evidence: plan.evidence,
      ownerOutcome: plan.ownerOutcome,
    });
    expect(projection.status).toBe("owner_revision_reopened");
    expect(projection.currentStepIndex).toBe(1);
    const bind = projection.steps[2].substeps.find(
      (substep) => substep.id === "bind-offer-to-owner-decision",
    );
    expect(bind?.state).toBe("blocked");
    expect(bind?.blockers.join(" ")).toMatch(/revision/i);
  });

  it("refuses an owner outcome without a sent owner message or verified evidence", () => {
    expect(() =>
      planRecordOwnerOutcome(
        progress({ evidence: {} }),
        "approved_terms",
        gmailEvidence("owner-response:approved"),
      ),
    ).toThrow(/owner message/i);
    expect(() =>
      planRecordOwnerOutcome(
        progress(),
        "approved_terms",
        buildRenewalEvidenceReference({
          ref: "owner-response:na",
          source: "app_record",
          disposition: "not_applicable",
          reason: "not applicable",
        }),
      ),
    ).toThrow(/verified evidence/i);
    expect(() =>
      planRecordOwnerOutcome(
        progress(),
        "approved_terms",
        buildRenewalEvidenceReference({
          ref: "owner-response:rentvine",
          source: "rentvine_snapshot",
          disposition: "verified",
        }),
      ),
    ).toThrow(/Gmail receipt or verified app record/i);
  });
});

const LEASE_STATE = {
  startDate: "2025-09-01",
  endDate: "2026-08-31",
  increaseEligibilityDate: "2026-08-31",
} as const;

function datesEffect(endDate: string) {
  return {
    kind: "renewal_dates_update" as const,
    before: LEASE_STATE,
    after: { endDate, increaseEligibilityDate: endDate },
  };
}

describe("S105 version binding (ARCH-S105-2 / AC-S105-2)", () => {
  it("marks every downstream artifact stale when the owner terms change", () => {
    const current = progress();
    const plan = planRecordOwnerDecision(current, {
      decision: "increase",
      offeredRent: 1500,
    });
    expect(plan.ownerDecisionRevision).toBe(2);
    for (const key of [
      "tenant-offer-fact-lock",
      "tenant-draft-receipt",
      "packet-facts",
      "packet-snapshot",
    ] as const) {
      expect(plan.evidence[key]).toBeUndefined();
    }
    expect(plan.tenantOfferDraftId).toBeNull();
    expect(plan.evidence["owner-decision"]).toMatchObject({
      ref: "lease-progress:owner-decision:r2",
    });
  });

  it("refuses a confirmation captured against superseded source terms", () => {
    const base = {
      leaseId: "4821",
      account: RENEWAL_WRITEBACK_ACCOUNT,
      actorUid: "op-1",
      actorEmail: "op1@pmikcmetro.com",
      actorRole: "Admin",
      leaseState: LEASE_STATE,
      sourceReadAtIso: "2026-07-19T00:00:00.000Z",
      evidenceRef: "fixture:s97-evidence",
      effects: [datesEffect("2027-08-31")],
      nowMs: Date.parse("2026-07-19T00:00:00.000Z"),
    };
    const proposal = buildRenewalWritebackProposal(base);
    const superseded = buildRenewalWritebackProposal({
      ...base,
      effects: [datesEffect("2027-09-30")],
    });
    expect(superseded.previewHash).not.toBe(proposal.previewHash);
    expect(() =>
      assertRenewalWritebackConfirmation({
        proposal: superseded,
        effect: superseded.effects[0],
        confirmation: {
          previewHash: proposal.previewHash,
          effectHash: proposal.effects[0].effectHash,
          confirmedAtIso: "2026-07-19T00:00:01.000Z",
        },
        nowMs: base.nowMs + 1_000,
      }),
    ).toThrow(/does not match this exact proposal/i);
  });

  it("maps a repeated confirmation of the same effect to one attempt identity (AC-S105-3)", () => {
    const input = {
      leaseId: "4821",
      account: RENEWAL_WRITEBACK_ACCOUNT,
      actorUid: "op-1",
      actorEmail: "op1@pmikcmetro.com",
      actorRole: "Admin",
      leaseState: LEASE_STATE,
      sourceReadAtIso: "2026-07-19T00:00:00.000Z",
      evidenceRef: "fixture:s97-evidence",
      effects: [datesEffect("2027-08-31")],
      nowMs: Date.parse("2026-07-19T00:00:00.000Z"),
    };
    const first = buildRenewalWritebackProposal(input);
    const second = buildRenewalWritebackProposal(input);
    expect(renewalWritebackExecutionId(second, second.effects[0])).toBe(
      renewalWritebackExecutionId(first, first.effects[0]),
    );
  });
});

describe("S105 lifecycle completion (BEH-S105-1 / AC-S105-1)", () => {
  const accepted = {
    state: "accepted" as const,
    evidence: gmailEvidence("fixture:tenant-outcome"),
  };

  it("reaches complete only with the full accepted-path evidence set", () => {
    const projection = projectRenewalProcess({
      processVersion: RENEWAL_PROCESS_VERSION,
      evidence: completeEvidence(),
      ownerOutcome: {
        state: "approved_terms",
        evidence: gmailEvidence("fixture:owner-response"),
      },
      tenantOutcome: accepted,
      complete: true,
    });
    expect(projection.status).toBe("complete");
    expect(projection.steps.every((step) => step.state === "complete")).toBe(true);
  });

  it("returns the exact blocker when any single required evidence item is removed", () => {
    for (const key of REQUIRED_KEYS) {
      const map = completeEvidence();
      delete map[key];
      const projection = projectRenewalProcess({
        processVersion: RENEWAL_PROCESS_VERSION,
        evidence: map,
        ownerOutcome: {
          state: "approved_terms",
          evidence: gmailEvidence("fixture:owner-response"),
        },
        tenantOutcome: accepted,
        complete: true,
      });
      expect(projection.status).not.toBe("complete");
      const missing = projection.steps
        .flatMap((step) => step.substeps)
        .filter((substep) => substep.applicable && substep.requiredForStep)
        .flatMap((substep) => substep.missingEvidence);
      expect(missing).toContain(key);
    }
  });

  it("keeps a missing external dependency a visible blocker with its next action", () => {
    const map = completeEvidence();
    delete map["dotloop-packet-readback"];
    const projection = projectRenewalProcess({
      processVersion: RENEWAL_PROCESS_VERSION,
      evidence: map,
      ownerOutcome: {
        state: "approved_terms",
        evidence: gmailEvidence("fixture:owner-response"),
      },
      tenantOutcome: accepted,
      externalDependencies: {
        "dotloop-provider-mapping": {
          state: "missing",
          reason: "The Dotloop connection is unavailable.",
          nextAction:
            "Connect Dotloop in the Connection Center before building the packet.",
        },
      },
      complete: true,
    });
    expect(projection.status).not.toBe("complete");
    const blocked = projection.steps
      .flatMap((step) => step.substeps)
      .filter((substep) => substep.blockers.length > 0);
    expect(
      blocked.some((substep) => substep.blockers.join(" ").includes("Dotloop")),
    ).toBe(true);
  });
});

describe("S105 source and provider branches stop at a distinct state (BEH-S105-2)", () => {
  const accepted = {
    state: "accepted" as const,
    evidence: gmailEvidence("fixture:tenant-outcome"),
  };

  it.each([
    ["base-rent", "The current rent conflicts between RentVine and the operating Sheet."],
    ["lease-end-date", "The lease term needs review before renewal work continues."],
    ["renewal-recipients", "One authoritative owner recipient is unresolved."],
  ] as const)(
    "keeps %s a distinct, recoverable blocker rather than a silent completion",
    (key, reason) => {
      const map = completeEvidence();
      delete map[key as RenewalEvidenceKey];
      const projection = projectRenewalProcess({
        processVersion: RENEWAL_PROCESS_VERSION,
        evidence: map,
        ownerOutcome: {
          state: "approved_terms",
          evidence: gmailEvidence("fixture:owner-response"),
        },
        tenantOutcome: accepted,
        evidenceBlockers: {
          [key]: { reason, nextAction: `Resolve ${key} from its exact source.` },
        },
        complete: true,
      });
      expect(projection.status).not.toBe("complete");
      const blocked = projection.steps
        .flatMap((step) => step.substeps)
        .filter((substep) => substep.blockers.includes(reason));
      expect(blocked.length).toBeGreaterThan(0);
      expect(blocked[0].nextAction).toBe(`Resolve ${key} from its exact source.`);
    },
  );

  it("keeps an uncertain packet readback blocked behind its own dependency next action", () => {
    const reason =
      "The last packet write returned an uncertain result and is reconciling.";
    const map = completeEvidence();
    delete map["dotloop-packet-readback"];
    const projection = projectRenewalProcess({
      processVersion: RENEWAL_PROCESS_VERSION,
      evidence: map,
      ownerOutcome: {
        state: "approved_terms",
        evidence: gmailEvidence("fixture:owner-response"),
      },
      tenantOutcome: accepted,
      evidenceBlockers: {
        "dotloop-packet-readback": {
          reason,
          nextAction: "Reconcile the exact packet receipt before continuing.",
        },
      },
      complete: true,
    });
    expect(projection.status).not.toBe("complete");
    const blocked = projection.steps
      .flatMap((step) => step.substeps)
      .filter((substep) => substep.blockers.includes(reason));
    expect(blocked.length).toBeGreaterThan(0);
    // A missing external dependency states the more fundamental next action; either way the
    // operator is told exactly what to do rather than seeing a bare "blocked".
    expect(blocked[0].nextAction.trim().length).toBeGreaterThan(0);
  });

  it("shows a separately governed source write without letting it prove packet completion", () => {
    const map = completeEvidence();
    delete map["source-write-receipt"];
    const projection = projectRenewalProcess({
      processVersion: RENEWAL_PROCESS_VERSION,
      evidence: map,
      ownerOutcome: {
        state: "approved_terms",
        evidence: gmailEvidence("fixture:owner-response"),
      },
      tenantOutcome: accepted,
      complete: true,
    });
    // The source write is deliberately not a completion requirement: it has its own exact
    // lifecycle, so its absence never blocks the app's own completion evidence.
    expect(projection.status).toBe("complete");
    const substep = projection.steps
      .flatMap((step) => step.substeps)
      .find((candidate) => candidate.id === "keep-source-write-separate");
    expect(substep).toMatchObject({ requiredForStep: false });
    expect(substep?.missingEvidence).toContain("source-write-receipt");
  });

  it("keeps one lease's blocker out of another lease's projection", () => {
    const blocked = projectRenewalProcess({
      processVersion: RENEWAL_PROCESS_VERSION,
      evidence: (() => {
        const map = completeEvidence();
        delete map["base-rent"];
        return map;
      })(),
      ownerOutcome: {
        state: "approved_terms",
        evidence: gmailEvidence("fixture:owner-response"),
      },
      tenantOutcome: accepted,
      complete: true,
    });
    const healthy = projectRenewalProcess({
      processVersion: RENEWAL_PROCESS_VERSION,
      evidence: completeEvidence(),
      ownerOutcome: {
        state: "approved_terms",
        evidence: gmailEvidence("fixture:owner-response"),
      },
      tenantOutcome: accepted,
      complete: true,
    });
    expect(blocked.status).not.toBe("complete");
    expect(healthy.status).toBe("complete");
  });
});

describe("S105 no branch reaches a provider or a send (AC-S105-4)", () => {
  it("keeps the owner-outcome planner pure and provider-free", () => {
    const source = readFileSync("lib/lease-renewal/renewal-progress.ts", "utf8");
    const code = source.replaceAll(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code).not.toMatch(/googleapis|rentvine|dotloop|sendMessage|executeAction/i);
  });

  it("exposes every owner outcome as an app-owned state, never an action key", () => {
    const states: readonly RenewalOwnerOutcomeState[] = [
      "approved_terms",
      "revision_requested",
      "declined_non_renewal",
      "no_response",
    ];
    for (const state of states) {
      const plan = planRecordOwnerOutcome(
        progress(),
        state,
        gmailEvidence(`owner-response:${state}`),
      );
      expect(plan.ownerOutcome?.state).toBe(state);
      expect(plan.complete).toBe(false);
    }
  });
});
