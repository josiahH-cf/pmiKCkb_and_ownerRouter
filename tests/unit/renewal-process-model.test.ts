import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { LEASE_RENEWAL_STAGES } from "@/lib/lease-renewal/constants";
import { RENEWAL_STEPS } from "@/lib/lease-renewal/desk-model";
import {
  RENEWAL_STAGE,
  ownerDecisionIsCurrent,
  planMarkComplete,
  planRecordOwnerDecision,
  planRecordRenewalEvidence,
  planRecordTenantOfferDraft,
  planRecordTenantOutcome,
  type RenewalProgress,
  type RenewalProgressPlan,
} from "@/lib/lease-renewal/renewal-progress";
import {
  LEGACY_RENEWAL_PROCESS_VERSION,
  RENEWAL_COMPLETION_REQUIREMENTS,
  RENEWAL_PROCESS_DEFINITION,
  RENEWAL_PROCESS_STEP_IDS,
  RENEWAL_PROCESS_VERSION,
  assessRenewalProcessMigration,
  buildRenewalEvidenceReference,
  missingRenewalCompletionEvidence,
  projectRenewalProcess,
  removeRenewalEvidence,
  replaceRenewalEvidence,
  renewalEvidenceInvalidatedBy,
  type RenewalEvidenceMap,
  type RenewalEvidenceReference,
  type RenewalEvidenceSource,
  type RenewalTenantOutcome,
} from "@/lib/lease-renewal/renewal-process";

const APPROVED_STEP_TITLES = [
  "Find and verify the renewal",
  "Analyze market evidence and record the owner decision",
  "Prepare the tenant offer and track the decision",
  "Build the required document packet",
  "Obtain signatures and perform follow-up",
  "Complete final compliance checks and close the renewal",
] as const;

function verified(
  key: string,
  source: RenewalEvidenceSource = "app_record",
): RenewalEvidenceReference {
  return buildRenewalEvidenceReference({
    ref: `${source}:${key}:receipt-1`,
    source,
    disposition: "verified",
  });
}

function notApplicable(key: string): RenewalEvidenceReference {
  return buildRenewalEvidenceReference({
    ref: `policy:${key}:not-applicable`,
    source: "policy_version",
    disposition: "not_applicable",
    reason: `The approved ${key} rule does not apply to this lease.`,
  });
}

function acceptedEvidence(): RenewalEvidenceMap {
  const evidence: RenewalEvidenceMap = {};
  for (const requirement of RENEWAL_COMPLETION_REQUIREMENTS) {
    evidence[requirement.key] = requirement.allowNotApplicable
      ? notApplicable(requirement.key)
      : verified(requirement.key);
  }
  return evidence;
}

function asProgress(plan: RenewalProgressPlan): RenewalProgress {
  return { leaseId: "42", ...plan };
}

function acceptedOutcome(evidence: RenewalEvidenceMap): RenewalTenantOutcome {
  return {
    state: "accepted",
    evidence: evidence["tenant-outcome"] ?? verified("tenant-outcome", "gmail_receipt"),
  };
}

describe("S72 versioned six-step renewal process", () => {
  it("is deeply immutable and is the one exact six-step contract used by both projections", () => {
    expect(RENEWAL_PROCESS_DEFINITION.version).toBe(RENEWAL_PROCESS_VERSION);
    expect(RENEWAL_PROCESS_DEFINITION.steps.map((step) => step.id)).toEqual([
      ...RENEWAL_PROCESS_STEP_IDS,
    ]);
    expect(RENEWAL_PROCESS_DEFINITION.steps.map((step) => step.title)).toEqual([
      ...APPROVED_STEP_TITLES,
    ]);
    expect([...LEASE_RENEWAL_STAGES]).toEqual([...APPROVED_STEP_TITLES]);
    expect(RENEWAL_STEPS.map((step) => step.id)).toEqual([...RENEWAL_PROCESS_STEP_IDS]);

    expect(Object.isFrozen(RENEWAL_PROCESS_DEFINITION)).toBe(true);
    for (const step of RENEWAL_PROCESS_DEFINITION.steps) {
      expect(Object.isFrozen(step)).toBe(true);
      expect(Object.isFrozen(step.substeps)).toBe(true);
      expect(step.substeps.length).toBeGreaterThan(0);
      for (const substep of step.substeps) expect(Object.isFrozen(substep)).toBe(true);
    }
    const substepIds = RENEWAL_PROCESS_DEFINITION.steps.flatMap((step) =>
      step.substeps.map((substep) => substep.id),
    );
    expect(new Set(substepIds).size).toBe(substepIds.length);
  });

  it("accepts only bounded value-free evidence references and reasoned N/A evidence", () => {
    expect(
      buildRenewalEvidenceReference({
        ref: "gmail-thread:t-1:message:m-2",
        source: "gmail_receipt",
        disposition: "verified",
        fingerprint: "a".repeat(64),
      }),
    ).toMatchObject({ ref: "gmail-thread:t-1:message:m-2" });
    expect(() =>
      buildRenewalEvidenceReference({
        ref: "thread-1\nraw message body",
        source: "gmail_receipt",
        disposition: "verified",
      }),
    ).toThrow(/bounded value-free reference/i);
    expect(() =>
      buildRenewalEvidenceReference({
        ref: "policy:animal-terms",
        source: "policy_version",
        disposition: "not_applicable",
      }),
    ).toThrow(/source reason/i);
  });

  it("blocks each missing external dependency only at its exact dependent substep", () => {
    const evidence = acceptedEvidence();
    for (const key of [
      "owner-copy-version",
      "tenant-copy-version",
      "packet-catalog-version",
      "dotloop-packet-readback",
      "timing-policy-version",
    ] as const) {
      delete evidence[key];
    }
    const outcome = acceptedOutcome(evidence);
    outcome.evidence = verified("tenant-outcome", "gmail_receipt");
    evidence["tenant-outcome"] = outcome.evidence;

    const projection = projectRenewalProcess({
      processVersion: RENEWAL_PROCESS_VERSION,
      evidence,
      tenantOutcome: outcome,
      externalDependencies: {
        "approved-owner-copy": {
          state: "missing",
          reason: "Owner copy missing.",
          nextAction: "Publish owner copy.",
        },
        "approved-tenant-copy": {
          state: "missing",
          reason: "Tenant copy missing.",
          nextAction: "Publish tenant copy.",
        },
        "document-catalog": {
          state: "missing",
          reason: "Catalog missing.",
          nextAction: "Publish catalog.",
        },
        "dotloop-provider-mapping": {
          state: "missing",
          reason: "Dotloop mapping missing.",
          nextAction: "Supply mapping.",
        },
        "confirmed-timing-policy": {
          state: "missing",
          reason: "Timing policy missing.",
          nextAction: "Confirm timing.",
        },
        "source-write-authority": {
          state: "missing",
          reason: "Source write remains closed.",
          nextAction: "Keep it separate.",
        },
      },
    });

    const directlyBlocked = projection.steps.flatMap((step) =>
      step.substeps
        .filter((substep) => substep.blockers.length > 0)
        .map((item) => item.id),
    );
    expect(directlyBlocked).toEqual([
      "prepare-owner-copy",
      "render-tenant-copy",
      "load-packet-catalog",
      "read-back-document-packet",
      "keep-source-write-separate",
      "apply-confirmed-follow-up-policy",
    ]);
    expect(projection.steps[0]).toMatchObject({
      id: "verify-renewal",
      state: "complete",
    });
  });

  it("requires accepted-path evidence, rejects invalid N/A, and cannot trust a coarse complete flag", () => {
    const evidence = acceptedEvidence();
    evidence["base-rent"] = notApplicable("base-rent");
    const outcome = acceptedOutcome(evidence);

    expect(missingRenewalCompletionEvidence(evidence, outcome)).toContain("base-rent");
    const corruptProjection = projectRenewalProcess({
      processVersion: RENEWAL_PROCESS_VERSION,
      evidence: { "app-completion": verified("completion") },
      tenantOutcome: outcome,
      complete: true,
    });
    expect(corruptProjection.status).not.toBe("complete");
    expect(corruptProjection.steps.some((step) => step.state !== "complete")).toBe(true);
  });

  it("completes all six steps only after exact accepted-path evidence and an app receipt", () => {
    const evidence = acceptedEvidence();
    const outcome = acceptedOutcome(evidence);
    const current: RenewalProgress = {
      leaseId: "42",
      processVersion: RENEWAL_PROCESS_VERSION,
      stageIndex: RENEWAL_STAGE.compliance,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      ownerDecisionRevision: 1,
      tenantOfferDraftId: "draft-1",
      tenantOutcome: outcome,
      evidence,
      complete: false,
    };

    expect(missingRenewalCompletionEvidence(evidence, outcome)).toEqual([]);
    expect(() => planMarkComplete(current)).toThrow(/completion evidence reference/i);
    const completed = planMarkComplete(current, verified("completion"));
    const projection = projectRenewalProcess({
      processVersion: completed.processVersion,
      evidence: completed.evidence,
      tenantOutcome: completed.tenantOutcome,
      complete: completed.complete,
    });
    expect(projection.status).toBe("complete");
    expect(projection.steps).toHaveLength(6);
    expect(projection.steps.every((step) => step.state === "complete")).toBe(true);
  });

  it("pins renewal-v1 explicitly and keeps base rent distinct from recurring charges", () => {
    const started = planRecordOwnerDecision(null, {
      decision: "increase",
      offeredRent: 1300,
      charges: { rbp: 28, insurance: 14 },
    });
    expect(started).toMatchObject({
      processVersion: RENEWAL_PROCESS_VERSION,
      stageIndex: RENEWAL_STAGE.owner,
      ownerDecision: {
        offeredRent: 1300,
        charges: { rbp: 28, insurance: 14 },
      },
      ownerDecisionRevision: 1,
    });
    expect(started.evidence["recurring-charges-separated"]).toBeDefined();
    expect(ownerDecisionIsCurrent(asProgress(started))).toBe(true);
  });

  it("does not treat an unsent tenant draft as the tenant decision", () => {
    const started = asProgress(
      planRecordOwnerDecision(null, { decision: "increase", offeredRent: 1300 }),
    );
    const drafted = planRecordTenantOfferDraft(started, "draft-1");
    expect(drafted.stageIndex).toBe(RENEWAL_STAGE.tenant);
    expect(drafted.tenantOutcome).toBeNull();
    expect(drafted.complete).toBe(false);
  });

  it("routes acceptance to documents, while waiting and unknown remain incomplete", () => {
    const drafted = asProgress(
      planRecordTenantOfferDraft(
        asProgress(
          planRecordOwnerDecision(null, {
            decision: "increase",
            offeredRent: 1300,
          }),
        ),
        "draft-1",
      ),
    );
    const accepted = planRecordTenantOutcome(
      drafted,
      "accepted",
      verified("tenant-accepted", "gmail_receipt"),
    );
    expect(accepted.stageIndex).toBe(RENEWAL_STAGE.documents);

    for (const state of ["awaiting_response", "needs_verification"] as const) {
      const result = planRecordTenantOutcome(
        drafted,
        state,
        verified(state, "gmail_receipt"),
      );
      const projection = projectRenewalProcess({
        processVersion: result.processVersion,
        evidence: result.evidence,
        tenantOutcome: result.tenantOutcome,
      });
      expect(projection.currentStepIndex).toBe(RENEWAL_STAGE.tenant);
      expect(projection.status).toBe(
        state === "awaiting_response" ? "waiting" : "needs_verification",
      );
    }
  });

  it("counter/change reopens owner work and invalidates stale downstream evidence only", () => {
    let drafted = asProgress(
      planRecordTenantOfferDraft(
        asProgress(
          planRecordOwnerDecision(null, {
            decision: "increase",
            offeredRent: 1300,
          }),
        ),
        "draft-1",
      ),
    );
    drafted = {
      ...drafted,
      evidence: {
        ...drafted.evidence,
        "lease-tracked": verified("lease-tracked"),
        "market-evidence": verified("market-evidence", "rentcast_receipt"),
        "packet-snapshot": verified("packet", "packet_snapshot"),
        "signature-state": verified("signature", "dotloop_receipt"),
        "app-completion": verified("completion"),
      },
    };

    const reopened = planRecordTenantOutcome(
      drafted,
      "counter_change_requested",
      verified("tenant-counter", "gmail_receipt"),
    );
    expect(reopened.stageIndex).toBe(RENEWAL_STAGE.owner);
    expect(reopened.ownerDecision).toEqual(drafted.ownerDecision);
    expect(reopened.tenantOfferDraftId).toBeNull();
    expect(reopened.evidence["owner-decision"]).toBeUndefined();
    expect(reopened.evidence["packet-snapshot"]).toBeUndefined();
    expect(reopened.evidence["app-completion"]).toBeUndefined();
    expect(reopened.evidence["lease-tracked"]).toBeDefined();
    expect(reopened.evidence["market-evidence"]).toBeDefined();
    expect(
      projectRenewalProcess({
        processVersion: reopened.processVersion,
        evidence: reopened.evidence,
        tenantOutcome: reopened.tenantOutcome,
      }).status,
    ).toBe("counter_reopened");
  });

  it("decline terminates only through a documented non-renewal handoff", () => {
    const drafted = asProgress(
      planRecordTenantOfferDraft(
        asProgress(
          planRecordOwnerDecision(null, {
            decision: "keep_same",
            offeredRent: 1250,
          }),
        ),
        "draft-1",
      ),
    );
    const declined = asProgress(
      planRecordTenantOutcome(
        drafted,
        "declined_nonrenewing",
        verified("tenant-declined", "gmail_receipt"),
      ),
    );
    const needsHandoff = projectRenewalProcess({
      processVersion: declined.processVersion,
      evidence: declined.evidence,
      tenantOutcome: declined.tenantOutcome,
    });
    expect(needsHandoff.status).toBe("non_renewal_handoff_required");
    expect(needsHandoff.steps[3].substeps.every((substep) => !substep.applicable)).toBe(
      true,
    );

    const handedOff = planRecordRenewalEvidence(
      declined,
      "non-renewal-handoff",
      verified("non-renewal-handoff"),
    );
    expect(
      projectRenewalProcess({
        processVersion: handedOff.processVersion,
        evidence: handedOff.evidence,
        tenantOutcome: handedOff.tenantOutcome,
      }).status,
    ).toBe("non_renewal_handoff");
  });

  it("never silently reinterprets legacy stage indices and has an explicit migration seam", () => {
    const assessment = assessRenewalProcessMigration(LEGACY_RENEWAL_PROCESS_VERSION);
    expect(assessment).toMatchObject({
      status: "needs_review",
      toVersion: RENEWAL_PROCESS_VERSION,
    });
    expect(assessment.invalidatedFields).toContain("legacy stage index");

    const legacy = projectRenewalProcess({
      processVersion: LEGACY_RENEWAL_PROCESS_VERSION,
      evidence: { "owner-decision": verified("legacy-owner") },
    });
    expect(legacy.status).toBe("migration_required");
    expect(legacy.migrationRequired).toBe(true);
    expect(legacy.steps[0].state).toBe("blocked");

    const migrated = planRecordOwnerDecision(
      {
        leaseId: "42",
        processVersion: LEGACY_RENEWAL_PROCESS_VERSION,
        stageIndex: 3,
        ownerDecision: { decision: "increase", offeredRent: 1295 },
        ownerDecisionRevision: 0,
        tenantOfferDraftId: "legacy-draft",
        tenantOutcome: null,
        evidence: {},
        complete: true,
      },
      { decision: "increase", offeredRent: 1300 },
    );
    expect(migrated).toMatchObject({
      processVersion: RENEWAL_PROCESS_VERSION,
      stageIndex: RENEWAL_STAGE.owner,
      tenantOfferDraftId: null,
      complete: false,
    });
  });

  it("invalidates exact transitive dependents when upstream evidence changes", () => {
    const invalidated = renewalEvidenceInvalidatedBy("base-rent");
    expect(invalidated).toContain("owner-decision");
    expect(invalidated).toContain("tenant-draft-receipt");
    expect(invalidated).toContain("app-completion");
    expect(invalidated).not.toContain("lease-tracked");

    const current: RenewalProgress = {
      leaseId: "42",
      processVersion: RENEWAL_PROCESS_VERSION,
      stageIndex: RENEWAL_STAGE.compliance,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      ownerDecisionRevision: 1,
      tenantOfferDraftId: "draft-1",
      tenantOutcome: {
        state: "accepted",
        evidence: verified("accepted", "gmail_receipt"),
      },
      evidence: {
        "lease-tracked": verified("lease-tracked"),
        "base-rent": verified("old-rent", "rentvine_snapshot"),
        "owner-decision": verified("owner-decision"),
        "tenant-draft-receipt": verified("draft", "gmail_receipt"),
        "tenant-outcome": verified("accepted", "gmail_receipt"),
        "app-completion": verified("completion"),
      },
      complete: true,
    };
    const changed = planRecordRenewalEvidence(
      current,
      "base-rent",
      verified("new-rent", "rentvine_snapshot"),
    );
    expect(changed.stageIndex).toBe(RENEWAL_STAGE.owner);
    expect(changed.tenantOfferDraftId).toBeNull();
    expect(changed.tenantOutcome).toBeNull();
    expect(changed.evidence["owner-decision"]).toBeUndefined();
    expect(changed.evidence["app-completion"]).toBeUndefined();
    expect(changed.evidence["lease-tracked"]).toBeDefined();
  });

  it("treats a newer observation of the same evidence identity as fresh, not drift", () => {
    const fingerprint = "b".repeat(64);
    const current: RenewalEvidenceMap = {
      "base-rent": buildRenewalEvidenceReference({
        ref: "reconciliation:lease-42:base-rent",
        source: "reconciliation_receipt",
        disposition: "verified",
        observedAt: "2026-08-28T12:00:00.000Z",
        fingerprint,
      }),
      "owner-decision": verified("owner-decision"),
    };
    const refreshed = replaceRenewalEvidence(current, "base-rent", {
      ref: "reconciliation:lease-42:base-rent",
      source: "reconciliation_receipt",
      disposition: "verified",
      observedAt: "2026-08-29T12:00:00.000Z",
      fingerprint,
    });
    expect(refreshed.invalidated).toEqual([]);
    expect(refreshed.evidence["owner-decision"]).toBeDefined();
    expect(refreshed.evidence["base-rent"]?.observedAt).toBe("2026-08-29T12:00:00.000Z");

    const missing = removeRenewalEvidence(refreshed.evidence, "base-rent");
    expect(missing.evidence["base-rent"]).toBeUndefined();
    expect(missing.evidence["owner-decision"]).toBeUndefined();
  });

  it("refuses to bypass dedicated decision, draft, outcome, and completion transitions", () => {
    const current = asProgress(
      planRecordOwnerDecision(null, { decision: "increase", offeredRent: 1300 }),
    );
    for (const key of [
      "owner-decision",
      "tenant-draft-receipt",
      "tenant-outcome",
      "app-completion",
    ] as const) {
      expect(() => planRecordRenewalEvidence(current, key, verified(key))).toThrow(
        /dedicated state transition/i,
      );
    }
  });

  it("keeps the model and planners provider-free and incapable of granting or sending", () => {
    const files = [
      "lib/lease-renewal/renewal-process.ts",
      "lib/lease-renewal/renewal-progress.ts",
    ];
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    const imports = source
      .split("\n")
      .filter((line) => line.startsWith("import "))
      .join("\n");
    expect(imports).not.toMatch(/action-gate|integrations|gmail|rentvine|provider/i);
    expect(source).not.toMatch(/\bfetch\s*\(|production_allowed|\.send\s*\(/);
  });
});
