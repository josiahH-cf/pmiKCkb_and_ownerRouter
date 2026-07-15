import { describe, expect, it } from "vitest";

import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  actionRegistryHash,
  buildCurrentPreV1Manifest,
  buildCurrentV1CandidateManifest,
  v1ReleaseIdentityHash,
  V1_REQUIRED_ACTION_KEYS,
  verifyV1ReleaseManifest,
  type V1ReleaseManifest,
  type V1ReleaseVerificationAuthority,
} from "@/lib/release/manifest";

const COMMIT = "abcdef0123456789";
const REVISION = "pmi-kc-kb-00042-abc";

function evidenceAnchor(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function refreshAdvisorySignoffs(manifest: V1ReleaseManifest) {
  const releaseIdentityHash = v1ReleaseIdentityHash(manifest);
  manifest.danBusinessAcceptance = {
    status: "accepted",
    acceptedBy: "Dan",
    acceptedAt: "2026-07-14T20:00:00.000Z",
    evidenceRef: "docs/evidence/v1-owner-acceptance.md#dan-business",
    releaseIdentityHash,
  };
  manifest.josiahTechnicalAcceptance = {
    status: "accepted",
    acceptedBy: "Josiah",
    acceptedAt: "2026-07-14T20:05:00.000Z",
    evidenceRef: "docs/evidence/v1-owner-acceptance.md#josiah-technical",
    releaseIdentityHash,
  };
}

function acceptedFixture(): {
  manifest: V1ReleaseManifest;
  registry: CreateActionRegistryInput[];
} {
  const registry = ACTION_REGISTRY_SEED.map((entry) => ({ ...entry }));
  const manifest = buildCurrentV1CandidateManifest(COMMIT);
  manifest.stage = "v1";
  manifest.environment = "production";
  manifest.revision = REVISION;
  manifest.rulesVersion = "firestore.rules:sha256:abcdef0123456789";
  manifest.indexesVersion = "firestore.indexes:sha256:1234567890abcdef";
  manifest.registryHash = actionRegistryHash(registry);
  for (const [suite, row] of Object.entries(manifest.suites)) {
    row.state = "Accepted";
    row.evidenceLane = "production_test";
    row.evidenceRef = `docs/evidence/v1-production-test-suites.md#${suite.toLowerCase()}`;
  }
  manifest.actions = manifest.actions.map((action) => ({
    ...action,
    applicationCoverage: "production_test",
    activation: "test_ready",
    workflowEvidenceRef: `docs/evidence/v1-production-test-actions.md#${evidenceAnchor(action.key)}`,
    oneAttemptVerified: true,
    idempotencyVerified: true,
    correctionVerified: true,
  }));
  manifest.smokeCases = [
    {
      lane: "production_test",
      evidenceRef: "docs/evidence/v1-production-test-workflows.md#integrated-smoke",
    },
  ];
  manifest.migrations = ["docs/evidence/v1-release-operations.md#migrations-none"];
  manifest.deploymentEvidenceRef =
    "docs/evidence/v1-release-operations.md#deployed-revision";
  manifest.buildEvidenceRef = "docs/evidence/v1-release-operations.md#build";
  manifest.authenticationEvidenceRef =
    "docs/evidence/v1-release-operations.md#authentication";
  manifest.safetyEvidenceRef = "docs/evidence/v1-release-operations.md#safety";
  manifest.monitoringRef = "docs/evidence/v1-release-operations.md#monitoring";
  manifest.rollbackRef = "docs/evidence/v1-release-operations.md#rollback";
  manifest.browserAcceptanceRef =
    "docs/evidence/v1-browser-acceptance.md#desktop-and-phone";
  return { manifest, registry };
}

function acceptedAuthority(
  manifest: V1ReleaseManifest,
  registry: readonly CreateActionRegistryInput[],
  missingReference?: string,
): V1ReleaseVerificationAuthority {
  return {
    commit: manifest.commit,
    revision: manifest.revision,
    rulesVersion: manifest.rulesVersion,
    indexesVersion: manifest.indexesVersion,
    registryHash: actionRegistryHash(registry),
    resolveEvidence(reference) {
      return {
        fileExists: reference !== missingReference,
        anchorExists: reference !== missingReference,
      };
    },
  };
}

function enableLiveAction(
  manifest: V1ReleaseManifest,
  registry: CreateActionRegistryInput[],
  key = V1_REQUIRED_ACTION_KEYS[0],
) {
  const anchor = evidenceAnchor(key);
  const liveEvidenceRef = `docs/evidence/v1-action-proofs.md#${anchor}-execution`;
  const action = manifest.actions.find((candidate) => candidate.key === key)!;
  action.activation = "enabled";
  action.liveEvidenceRef = liveEvidenceRef;
  action.monitoringRef = `docs/evidence/v1-action-proofs.md#${anchor}-monitor`;
  action.rollbackRef = `docs/evidence/v1-action-proofs.md#${anchor}-rollback`;

  const entry = registry.find((candidate) => candidate.key === key)!;
  entry.readiness = "Approved for Execution";
  entry.evidence_status = "Documented";
  entry.production_allowed = true;
  entry.documented_evidence = `Bounded production proof: ${liveEvidenceRef}`;
  entry.connection_health_check_ref = `health.v1.${anchor}`;
  entry.rollback_note =
    "Restore the prior provider state from the recorded receipt and preserve immutable audit.";
  manifest.registryHash = actionRegistryHash(registry);
  refreshAdvisorySignoffs(manifest);
  return { action, entry, key };
}

describe("V1 application release and provider activation manifest", () => {
  it("reports the local candidate with grouped application-readiness gates", () => {
    expect(buildCurrentPreV1Manifest("abcdef0")).toEqual(
      buildCurrentV1CandidateManifest("abcdef0"),
    );
    const result = verifyV1ReleaseManifest(buildCurrentV1CandidateManifest("abcdef0"));
    expect(result.ok).toBe(false);
    expect(result.state).toBe("pre-v1");
    expect(result.issues).toContain("Release stage is v1-candidate, not v1.");
    expect(result.issues).toContain("Release environment is local, not production.");
    expect(result.issues).toContain(
      `${V1_REQUIRED_ACTION_KEYS.length} required actions lack production Test or Live workflow coverage.`,
    );
    expect(result.issues).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/Dan|Josiah|signoff/i)]),
    );
    expect(result.signoff.statuses).toEqual({
      danBusiness: "pending",
      josiahTechnical: "pending",
    });
    expect(result.activation.counts.unavailable).toBe(V1_REQUIRED_ACTION_KEYS.length);
  });

  it("accepts a working production V1 proven in the isolated Test lane", () => {
    const { manifest, registry } = acceptedFixture();
    const result = verifyV1ReleaseManifest(
      manifest,
      registry,
      acceptedAuthority(manifest, registry),
    );

    expect(result).toMatchObject({ ok: true, state: "v1", issues: [] });
    expect(result.activation).toMatchObject({ ok: true, issues: [] });
    expect(result.activation.counts.test_ready).toBe(V1_REQUIRED_ACTION_KEYS.length);
    expect(result.activation.counts.enabled).toBe(0);
    expect(result.signoff).toMatchObject({
      complete: false,
      issues: [],
      statuses: { danBusiness: "pending", josiahTechnical: "pending" },
    });
  });

  it("keeps supplied signoff evidence resolution advisory", () => {
    const { manifest, registry } = acceptedFixture();
    refreshAdvisorySignoffs(manifest);
    const valid = verifyV1ReleaseManifest(
      manifest,
      registry,
      acceptedAuthority(manifest, registry),
    );
    expect(valid).toMatchObject({ ok: true, state: "v1", issues: [] });
    expect(valid.signoff).toMatchObject({ complete: true, issues: [] });

    const missingReference = "docs/evidence/v1-owner-acceptance.md#dan-business";
    const missing = verifyV1ReleaseManifest(
      manifest,
      registry,
      acceptedAuthority(manifest, registry, missingReference),
    );
    expect(missing).toMatchObject({ ok: true, state: "v1", issues: [] });
    expect(missing.signoff).toMatchObject({
      complete: false,
      statuses: { danBusiness: "invalid", josiahTechnical: "accepted" },
    });
    expect(missing.signoff.issues).toContain(
      "Dan business advisory signoff does not resolve to an existing evidence file and anchor.",
    );
  });

  it("reports enabled provider actions independently from application readiness", () => {
    const { manifest, registry } = acceptedFixture();
    enableLiveAction(manifest, registry);

    const result = verifyV1ReleaseManifest(
      manifest,
      registry,
      acceptedAuthority(manifest, registry),
    );
    expect(result).toMatchObject({ ok: true, state: "v1" });
    expect(result.activation.counts.enabled).toBe(1);
    expect(result.activation.counts.test_ready).toBe(V1_REQUIRED_ACTION_KEYS.length - 1);
  });

  it("never lets synthetic or Test-lane evidence claim a Live provider", () => {
    const { manifest, registry } = acceptedFixture();
    const { action, key } = enableLiveAction(manifest, registry);
    action.liveEvidenceRef =
      "docs/evidence/v1-production-test-actions.md#synthetic-execution";
    refreshAdvisorySignoffs(manifest);

    const result = verifyV1ReleaseManifest(
      manifest,
      registry,
      acceptedAuthority(manifest, registry),
    );
    expect(result).toMatchObject({ ok: false, state: "pre-v1" });
    expect(result.activation.issues).toContain(
      `${key} claims enabled without durable Live execution evidence.`,
    );
  });

  it("requires trusted pins and resolves production Test evidence as durable app proof", () => {
    const { manifest, registry } = acceptedFixture();
    expect(verifyV1ReleaseManifest(manifest, registry).issues).toContain(
      "V1 verification requires authoritative pins and an evidence resolver.",
    );

    const missing = manifest.suites.S22.evidenceRef!;
    const unresolved = verifyV1ReleaseManifest(
      manifest,
      registry,
      acceptedAuthority(manifest, registry, missing),
    );
    expect(unresolved.issues).toContain(
      "S22 acceptance evidence does not resolve to an existing evidence file and anchor.",
    );

    const driftedAuthority = acceptedAuthority(manifest, registry);
    driftedAuthority.rulesVersion = "firestore.rules:sha256:other-authoritative-pin";
    driftedAuthority.indexesVersion = "firestore.indexes:sha256:other-authoritative-pin";
    expect(verifyV1ReleaseManifest(manifest, registry, driftedAuthority).issues).toEqual(
      expect.arrayContaining([
        "Firestore rules do not match the authoritative version pin.",
        "Firestore indexes do not match the authoritative version pin.",
      ]),
    );
  });

  it("requires actual production evidence for deploy, build, auth, and browser gates", () => {
    const { manifest, registry } = acceptedFixture();
    manifest.authenticationEvidenceRef =
      "docs/evidence/v1-production-test-auth.md#synthetic-login";
    refreshAdvisorySignoffs(manifest);

    const result = verifyV1ReleaseManifest(
      manifest,
      registry,
      acceptedAuthority(manifest, registry),
    );
    expect(result.issues).toContain(
      "Production authentication lacks durable production evidence.",
    );
  });

  it("requires the exact suite AC sets and exact unique action set", () => {
    const first = acceptedFixture();
    first.manifest.suites.S22.acceptanceIds.pop();
    const duplicate = first.manifest.actions[0];
    first.manifest.actions[first.manifest.actions.length - 1] = { ...duplicate };
    const result = verifyV1ReleaseManifest(first.manifest, first.registry);
    expect(result.issues).toContain(
      "S22 acceptance IDs do not match the exact required set.",
    );
    expect(result.issues).toContain(
      "Manifest actions do not exactly match the unique required V1 action set.",
    );

    const second = acceptedFixture();
    second.manifest.actions[0] = {
      ...second.manifest.actions[0],
      key: "unexpected.release.action",
    };
    expect(verifyV1ReleaseManifest(second.manifest, second.registry).issues).toContain(
      "Unexpected manifest action unexpected.release.action.",
    );
  });

  it("preserves one-attempt, idempotency, and correction verification", () => {
    const { manifest, registry } = acceptedFixture();
    manifest.actions[0].oneAttemptVerified = false;
    manifest.actions[1].idempotencyVerified = false;
    manifest.actions[2].correctionVerified = false;
    refreshAdvisorySignoffs(manifest);

    expect(verifyV1ReleaseManifest(manifest, registry).issues).toEqual(
      expect.arrayContaining([
        "1 required actions lack one-attempt verification.",
        "1 required actions lack idempotency verification.",
        "1 required actions lack correction/rollback verification.",
      ]),
    );
  });

  it("reports malformed or wrongly named signoffs as advisory only", () => {
    const first = acceptedFixture();
    refreshAdvisorySignoffs(first.manifest);
    first.manifest.danBusinessAcceptance = {
      status: "accepted",
      acceptedBy: "Business alias",
      acceptedAt: "2026-07-14T20:00:00.000Z",
      evidenceRef: "docs/evidence/v1-owner-acceptance.md#dan-business",
      releaseIdentityHash: v1ReleaseIdentityHash(first.manifest),
    };
    const wrongName = verifyV1ReleaseManifest(
      first.manifest,
      first.registry,
      acceptedAuthority(first.manifest, first.registry),
    );
    expect(wrongName).toMatchObject({ ok: true, state: "v1", issues: [] });
    expect(wrongName.signoff.issues).toContain(
      "Dan business advisory signoff must be recorded by Dan.",
    );
    expect(wrongName.signoff.statuses.danBusiness).toBe("invalid");

    const second = acceptedFixture();
    refreshAdvisorySignoffs(second.manifest);
    const malformed = structuredClone(second.manifest) as unknown as Record<
      string,
      unknown
    >;
    delete (malformed.josiahTechnicalAcceptance as Record<string, unknown>).evidenceRef;
    const malformedResult = verifyV1ReleaseManifest(
      malformed,
      second.registry,
      acceptedAuthority(second.manifest, second.registry),
    );
    expect(malformedResult).toMatchObject({ ok: true, state: "v1", issues: [] });
    expect(malformedResult.signoff.issues).toContain(
      "Josiah technical advisory signoff is malformed.",
    );
    expect(malformedResult.signoff.statuses.josiahTechnical).toBe("invalid");
  });

  it("requires distinct Live execution, monitoring, and rollback proof", () => {
    const { manifest, registry } = acceptedFixture();
    const { action, key } = enableLiveAction(manifest, registry);
    action.monitoringRef = action.rollbackRef;
    refreshAdvisorySignoffs(manifest);

    const result = verifyV1ReleaseManifest(manifest, registry);
    expect(result.activation.issues).toContain(
      `${key} conflates Live execution, monitoring, and rollback evidence.`,
    );
  });

  it("identity-checks supplied signoffs without making them V1 gates", () => {
    const { manifest, registry } = acceptedFixture();
    refreshAdvisorySignoffs(manifest);
    manifest.actions[0].workflowEvidenceRef =
      "docs/evidence/v1-production-test-actions.md#changed-after-signoff";
    const result = verifyV1ReleaseManifest(
      manifest,
      registry,
      acceptedAuthority(manifest, registry),
    );
    expect(result).toMatchObject({ ok: true, state: "v1", issues: [] });
    expect(result.signoff.issues).toEqual(
      expect.arrayContaining([
        "Dan business advisory signoff does not match this release identity.",
        "Josiah technical advisory signoff does not match this release identity.",
      ]),
    );
  });

  it("hashes full Registry contracts and enforces authoritative pins", () => {
    const { manifest, registry } = acceptedFixture();
    registry[0].rollback_note =
      "A changed but otherwise valid production rollback contract.";
    const authority = acceptedAuthority(manifest, registry);
    authority.commit = "1111111111111111";
    authority.revision = "pmi-kc-kb-99999-other";
    const result = verifyV1ReleaseManifest(manifest, registry, authority);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "Action Registry hash drifted from the pinned manifest.",
        "Release commit does not match the authoritative commit pin.",
        "Release revision does not match the authoritative revision pin.",
        "Action Registry does not match the authoritative Registry pin.",
      ]),
    );
  });
});
