import { describe, expect, it } from "vitest";

import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  actionRegistryHash,
  buildCurrentPreV1Manifest,
  v1ReleaseIdentityHash,
  V1_REQUIRED_ACTION_KEYS,
  verifyV1ReleaseManifest,
  type V1ReleaseVerificationAuthority,
  type V1ReleaseManifest,
} from "@/lib/release/manifest";

const COMMIT = "abcdef0123456789";
const REVISION = "pmi-kc-kb-00042-abc";
const requiredActionKeys = new Set<string>(V1_REQUIRED_ACTION_KEYS);

function evidenceAnchor(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function acceptedRegistry(): CreateActionRegistryInput[] {
  return ACTION_REGISTRY_SEED.map((entry) => {
    if (!requiredActionKeys.has(entry.key)) return { ...entry };
    const anchor = evidenceAnchor(entry.key);
    return {
      ...entry,
      readiness: "Approved for Execution" as const,
      evidence_status: "Documented" as const,
      production_allowed: true,
      documented_evidence: `Bounded production proof: docs/evidence/v1-action-proofs.md#${anchor}-execution`,
      connection_health_check_ref: `health.v1.${anchor}`,
      rollback_note:
        "Restore the prior provider state from the recorded receipt and preserve immutable audit.",
    };
  });
}

function acceptedFixture(): {
  manifest: V1ReleaseManifest;
  registry: CreateActionRegistryInput[];
} {
  const registry = acceptedRegistry();
  const manifest = buildCurrentPreV1Manifest(COMMIT);
  manifest.stage = "v1";
  manifest.environment = "production";
  manifest.revision = REVISION;
  manifest.rulesVersion = "firestore.rules:sha256:abcdef0123456789";
  manifest.indexesVersion = "firestore.indexes:sha256:1234567890abcdef";
  manifest.registryHash = actionRegistryHash(registry);
  for (const [suite, row] of Object.entries(manifest.suites)) {
    row.state = "Accepted";
    row.evidenceRef = `docs/evidence/v1-suite-acceptance.md#${suite.toLowerCase()}`;
  }
  manifest.actions = manifest.actions.map((action) => {
    const anchor = evidenceAnchor(action.key);
    return {
      ...action,
      state: "Accepted",
      productionAllowed: true,
      evidenceRef: `docs/evidence/v1-action-proofs.md#${anchor}-execution`,
      monitoringRef: `docs/evidence/v1-action-proofs.md#${anchor}-monitor`,
      rollbackRef: `docs/evidence/v1-action-proofs.md#${anchor}-rollback`,
    };
  });
  manifest.smokeCases = ["docs/evidence/v1-release-operations.md#smoke"];
  manifest.migrations = ["docs/evidence/v1-release-operations.md#migrations-none"];
  manifest.monitoringRef = "docs/evidence/v1-release-operations.md#monitoring";
  manifest.rollbackRef = "docs/evidence/v1-release-operations.md#rollback";
  manifest.browserAcceptanceRef =
    "docs/evidence/v1-browser-acceptance.md#desktop-and-phone";
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

describe("V1 release manifest", () => {
  it("keeps the current local candidate pre-V1 with exact gates", () => {
    const result = verifyV1ReleaseManifest(buildCurrentPreV1Manifest("abcdef0"));
    expect(result.ok).toBe(false);
    expect(result.state).toBe("pre-v1");
    expect(result.issues).toContain("Release stage is pre-v1-maintenance, not v1.");
    expect(result.issues).toContain("Release environment is local, not production.");
    expect(result.issues).toContain("S25 is Gated, not Accepted.");
    expect(result.issues).toContain("Dan business acceptance is pending.");
  });

  it("accepts only a production manifest with complete evidence and exact pins", () => {
    const { manifest, registry } = acceptedFixture();
    expect(
      verifyV1ReleaseManifest(manifest, registry, acceptedAuthority(manifest, registry)),
    ).toMatchObject({ ok: true, state: "v1", issues: [] });
  });

  it("requires trusted pins and resolves every production evidence anchor", () => {
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

  it("never promotes a local or synthetic all-green manifest", () => {
    const { manifest, registry } = acceptedFixture();
    manifest.environment = "local";
    manifest.smokeCases = ["integrated synthetic fake-provider acceptance"];
    manifest.migrations = ["synthetic-migration-fixture"];
    const result = verifyV1ReleaseManifest(manifest, registry);
    expect(result).toMatchObject({ ok: false, state: "pre-v1" });
    expect(result.issues).toContain("Release environment is local, not production.");
    expect(result.issues).toContain(
      "Release smoke cases still reference local or synthetic evidence.",
    );
    expect(result.issues).toContain(
      "Release migrations still reference local or synthetic artifacts.",
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
    const unexpected = verifyV1ReleaseManifest(second.manifest, second.registry);
    expect(unexpected.issues).toContain(
      "Unexpected manifest action unexpected.release.action.",
    );
  });

  it("rejects incomplete or wrongly named owner acceptance", () => {
    const first = acceptedFixture();
    first.manifest.danBusinessAcceptance = {
      status: "accepted",
      acceptedBy: "Business alias",
      acceptedAt: "2026-07-14T20:00:00.000Z",
      evidenceRef: "docs/evidence/v1-owner-acceptance.md#dan-business",
      releaseIdentityHash:
        first.manifest.josiahTechnicalAcceptance.status === "accepted"
          ? first.manifest.josiahTechnicalAcceptance.releaseIdentityHash
          : "0".repeat(64),
    };
    expect(verifyV1ReleaseManifest(first.manifest, first.registry).issues).toContain(
      "Dan business acceptance must be recorded by Dan.",
    );

    const second = acceptedFixture();
    const malformed = structuredClone(second.manifest) as unknown as Record<
      string,
      unknown
    >;
    delete (malformed.josiahTechnicalAcceptance as Record<string, unknown>).evidenceRef;
    expect(verifyV1ReleaseManifest(malformed, second.registry).issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("josiahTechnicalAcceptance.evidenceRef"),
      ]),
    );
  });

  it("rejects unresolved or conflated action evidence, monitoring, and rollback", () => {
    const { manifest, registry } = acceptedFixture();
    const key = V1_REQUIRED_ACTION_KEYS[0];
    const action = manifest.actions.find((candidate) => candidate.key === key)!;
    action.evidenceRef = "docs/evidence/synthetic-proof.md";
    action.monitoringRef = action.rollbackRef;
    const registryEntry = registry.find((candidate) => candidate.key === key)!;
    registryEntry.documented_evidence = "Pending vendor confirmation.";
    registryEntry.connection_health_check_ref = "<pending-health>";
    registryEntry.rollback_note = "Undocumented.";
    manifest.registryHash = actionRegistryHash(registry);

    const result = verifyV1ReleaseManifest(manifest, registry);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        `Required action ${key} lacks durable execution evidence.`,
        `Required action ${key} conflates execution, monitor, and rollback evidence.`,
        `Required action ${key} has unresolved Registry evidence.`,
        `Required action ${key} lacks a resolved Registry health monitor.`,
        `Required action ${key} lacks a resolved Registry rollback contract.`,
      ]),
    );
  });

  it("rejects one durable evidence reference reused across release gates", () => {
    const { manifest, registry } = acceptedFixture();
    manifest.suites.S21.evidenceRef = manifest.suites.S20.evidenceRef;

    const result = verifyV1ReleaseManifest(
      manifest,
      registry,
      acceptedAuthority(manifest, registry),
    );
    expect(result.issues).toContain(
      `Release evidence reference is reused across gates: ${manifest.suites.S20.evidenceRef}.`,
    );
  });

  it("rejects path aliases and case-folded reuse of one durable evidence proof", () => {
    const dotAlias = acceptedFixture();
    dotAlias.manifest.suites.S21.evidenceRef =
      "docs/evidence/./v1-suite-acceptance.md#s21";
    expect(
      verifyV1ReleaseManifest(dotAlias.manifest, dotAlias.registry).issues,
    ).toContain("S21 lacks durable production acceptance evidence.");

    const caseAlias = acceptedFixture();
    caseAlias.manifest.suites.S21.evidenceRef =
      "docs/evidence/V1-SUITE-ACCEPTANCE.md#S20";
    expect(
      verifyV1ReleaseManifest(caseAlias.manifest, caseAlias.registry).issues,
    ).toContain(
      "Release evidence reference is reused across gates: docs/evidence/V1-SUITE-ACCEPTANCE.md#S20.",
    );
  });

  it("binds both owner acceptances to the exact non-circular release identity", () => {
    const original = acceptedFixture();
    const changed = structuredClone(original.manifest);
    changed.commit = "1111111111111111";
    changed.revision = "pmi-kc-kb-00043-def";
    const result = verifyV1ReleaseManifest(
      changed,
      original.registry,
      acceptedAuthority(changed, original.registry),
    );
    expect(result.issues).toEqual(
      expect.arrayContaining([
        "Dan business acceptance does not match this release identity.",
        "Josiah technical acceptance does not match this release identity.",
      ]),
    );
  });

  it("hashes full Registry contracts and enforces authoritative commit/revision pins", () => {
    const { manifest, registry } = acceptedFixture();
    const entry = registry.find((candidate) => requiredActionKeys.has(candidate.key))!;
    entry.rollback_note = "A changed but otherwise valid production rollback contract.";
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
