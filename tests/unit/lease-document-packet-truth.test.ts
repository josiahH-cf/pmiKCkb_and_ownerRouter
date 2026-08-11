import { describe, expect, it } from "vitest";

import { applyApprovedFactResolution } from "@/lib/lease-documents/fact-resolution";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import type {
  PacketAnimal,
  PacketEvaluationInput,
} from "@/lib/lease-documents/packet-types";
import { readyS66Input, s66Fact, s66Source } from "@/tests/fixtures/s66-packet";

function replaceFact(
  input: PacketEvaluationInput,
  fieldKey: string,
  replacement?: ReturnType<typeof s66Fact>,
): PacketEvaluationInput {
  return {
    ...input,
    facts: [
      ...input.facts.filter((fact) => fact.fieldKey !== fieldKey),
      ...(replacement ? [replacement] : []),
    ],
  };
}

describe("S66 deterministic packet choice and provenance", () => {
  it.each([
    ["new tenancy", "transaction.type", "new_tenancy"],
    ["inherited renewal", "management.origin", "inherited"],
  ])("selects a full packet for a verified %s", (_label, fieldKey, value) => {
    const input = replaceFact(readyS66Input(), fieldKey, s66Fact(fieldKey, value));
    const result = evaluateRenewalPacket(input);
    expect(result.packetContext).toBe("full_lease_packet");
    expect(result.state).toBe("Ready for preview");
    expect(result.manifest?.includedArtifacts.map((artifact) => artifact.kind)).toContain(
      "standard_lease",
    );
  });

  it("selects an extension only for a verified compatible PMI form", () => {
    const result = evaluateRenewalPacket(readyS66Input());
    expect(result.packetContext).toBe("renewal_extension");
    expect(result.state).toBe("Ready for preview");
    expect(result.manifest?.includedArtifacts.map((artifact) => artifact.kind)).toContain(
      "renewal_extension",
    );
  });

  it("uses the full packet for a verified incompatible form family", () => {
    const input = replaceFact(
      readyS66Input(),
      "active_lease.form_family",
      s66Fact("active_lease.form_family", "fixture-nonstandard-family", "executed_lease"),
    );
    expect(evaluateRenewalPacket(input).packetContext).toBe("full_lease_packet");
  });

  it("returns no manifest for unknown or conflicting classification", () => {
    const unknown = replaceFact(readyS66Input(), "management.origin");
    const conflict = {
      ...readyS66Input(),
      facts: [
        ...readyS66Input().facts,
        s66Fact("management.origin", "inherited", "executed_lease"),
      ],
    };
    expect(evaluateRenewalPacket(unknown)).toMatchObject({
      state: "Needs input",
      packetContext: null,
      manifest: null,
    });
    expect(evaluateRenewalPacket(conflict)).toMatchObject({
      state: "Conflict",
      packetContext: null,
      manifest: null,
    });
  });

  it("turns a required field with missing provenance into Needs input", () => {
    const input = readyS66Input();
    const rent = input.facts.find(
      (fact) => fact.fieldKey === "lease.monthly_rent_cents",
    )!;
    input.facts = input.facts.map((fact) =>
      fact === rent ? { ...fact, source: { ...fact.source, reference: "" } } : fact,
    );
    const result = evaluateRenewalPacket(input);
    expect(result.state).toBe("Needs input");
    expect(result.manifest?.fields).toHaveLength(0);
    expect(result.blockers.some((blocker) => blocker.fieldKey === rent.fieldKey)).toBe(
      true,
    );
  });

  it("is deterministic and invalidates the hash for a changed participant", () => {
    const first = evaluateRenewalPacket(readyS66Input());
    const repeated = evaluateRenewalPacket(readyS66Input());
    const changed = readyS66Input();
    changed.participants = changed.participants.map((participant) =>
      participant.participantId === "fixture-tenant-b"
        ? { ...participant, signerRole: "fixture-different-role" }
        : participant,
    );
    expect(repeated).toEqual(first);
    expect(evaluateRenewalPacket(changed).payloadHash).not.toBe(first.payloadHash);
  });
});

describe("S66 conflict resolution and bounded truth", () => {
  it("refuses reasonless/source-less resolution and preserves conflict in the prior result", () => {
    const input = readyS66Input();
    input.facts.push(s66Fact("lease.monthly_rent_cents", 654_321, "executed_lease"));
    const conflicted = evaluateRenewalPacket(input);
    expect(conflicted.state).toBe("Conflict");

    expect(() =>
      applyApprovedFactResolution(input, {
        fieldKey: "lease.monthly_rent_cents",
        normalizedValue: 123_456,
        displayValue: "123456",
        source: { ...s66Source("executed_lease"), reference: "" },
        reason: "",
        actorUid: "fixture-admin",
        authority: "Admin",
        scope: "tenant_packet",
        resolvedAt: "2026-08-10T13:00:00.000Z",
      }),
    ).toThrow(/reason, source/i);

    const successorInput = applyApprovedFactResolution(input, {
      fieldKey: "lease.monthly_rent_cents",
      normalizedValue: 123_456,
      displayValue: "123456",
      source: s66Source("rentvine", "resolution:fixture-rent"),
      reason: "Exact executed term verified in the fixture source.",
      actorUid: "fixture-admin",
      authority: "Admin",
      scope: "tenant_packet",
      resolvedAt: "2026-08-10T13:00:00.000Z",
    });
    const successor = evaluateRenewalPacket(successorInput);
    expect(successor.state).toBe("Ready for preview");
    expect(successor.payloadHash).not.toBe(conflicted.payloadHash);
    expect(
      conflicted.blockers.some((blocker) => blocker.code === "conflicting_fact"),
    ).toBe(true);
  });

  it("rejects a Boom-sourced fact instead of treating enrollment as document truth", () => {
    const input = replaceFact(
      readyS66Input(),
      "lease.monthly_rent_cents",
      s66Fact("lease.monthly_rent_cents", 123_456, "boom"),
    );
    expect(evaluateRenewalPacket(input)).toMatchObject({ state: "Needs input" });
  });
});

describe("S66 charges, animals, and conditional artifacts", () => {
  it("requires RBP applicability and never defaults an applicable amount", () => {
    const missing = readyS66Input();
    missing.charges = [];
    expect(evaluateRenewalPacket(missing).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "resident_benefit_package" }),
      ]),
    );

    const applicable = readyS66Input();
    applicable.charges[0] = { ...applicable.charges[0], applicable: true };
    expect(evaluateRenewalPacket(applicable).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "charge_unavailable" })]),
    );
  });

  it("does not add a PMI charge to verified external insurance coverage", () => {
    const input = replaceFact(
      readyS66Input(),
      "insurance.coverage_method",
      s66Fact(
        "insurance.coverage_method",
        "verified_external_coverage",
        "company_policy",
      ),
    );
    const result = evaluateRenewalPacket(input);
    expect(result.state).toBe("Ready for preview");
    expect(result.manifest?.charges.some((charge) => charge.kind === "insurance")).toBe(
      false,
    );
  });

  it("preserves two animals as distinct records and scopes a missing fact to the animal artifact", () => {
    const animal = (id: string): PacketAnimal => ({
      animalId: id,
      agreementApplicable: true,
      policyVersion: "fixture-animal-policy-v1",
      chargeIds: [],
      facts: [
        {
          key: "species",
          value: "fixture-species",
          source: s66Source("approved_policy"),
          confidence: "Verified",
        },
        {
          key: "breed",
          value: "fixture-breed",
          source: s66Source("approved_policy"),
          confidence: "Verified",
        },
        {
          key: "weight",
          value: 42,
          source: s66Source("approved_policy"),
          confidence: "Verified",
        },
        {
          key: "policy_treatment",
          value: "fixture-verified-treatment",
          source: s66Source("approved_policy"),
          confidence: "Verified",
        },
      ],
    });
    const input = readyS66Input();
    input.animals = [animal("fixture-animal-a"), animal("fixture-animal-b")];
    let result = evaluateRenewalPacket(input);
    expect(result.state).toBe("Ready for preview");
    expect(result.manifest?.animals.map((entry) => entry.animalId)).toEqual([
      "fixture-animal-a",
      "fixture-animal-b",
    ]);
    expect(result.manifest?.includedArtifacts.map((artifact) => artifact.kind)).toContain(
      "animal_agreement",
    );

    input.animals[1].facts = input.animals[1].facts.filter(
      (fact) => fact.key !== "breed",
    );
    result = evaluateRenewalPacket(input);
    expect(result.state).toBe("Needs input");
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "animal_agreement",
          fieldKey: "animals.fixture-animal-b.breed",
        }),
      ]),
    );
  });

  it.each([
    [1977, "Included"],
    [1978, "Not applicable"],
  ])("applies the exact lead threshold to year %i", (year, expected) => {
    const input = replaceFact(
      readyS66Input(),
      "property.year_built",
      s66Fact("property.year_built", year),
    );
    const result = evaluateRenewalPacket(input);
    const artifacts = [
      ...(result.manifest?.includedArtifacts ?? []),
      ...(result.manifest?.excludedArtifacts ?? []),
    ];
    expect(
      artifacts.find((artifact) => artifact.kind === "lead_disclosure")?.ruleResult,
    ).toBe(expected);
  });

  it.each([
    "property.year_built",
    "property.city_addendum_applicable",
    "property.hoa_applicable",
  ])("keeps an unknown conditional fact visible as Needs input: %s", (fieldKey) => {
    const result = evaluateRenewalPacket(replaceFact(readyS66Input(), fieldKey));
    expect(result.state).toBe("Needs input");
    expect(result.blockers.some((blocker) => blocker.fieldKey === fieldKey)).toBe(true);
  });

  it("blocks only a consumed missing artifact and retains an inactive version for exclusion evidence", () => {
    const input = readyS66Input();
    input.catalog.artifacts = input.catalog.artifacts.map((artifact) =>
      artifact.kind === "lead_disclosure"
        ? { ...artifact, status: "superseded" }
        : artifact,
    );
    // Year 1978 excludes the artifact, so its inactive version is still enough to explain the rule.
    expect(evaluateRenewalPacket(input).state).toBe("Ready for preview");

    input.catalog.artifacts = input.catalog.artifacts.filter(
      (artifact) => artifact.kind !== "renewal_extension",
    );
    const blocked = evaluateRenewalPacket(input);
    expect(blocked.state).toBe("Needs input");
    expect(blocked.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "artifact_unavailable",
          scope: "renewal_extension",
        }),
      ]),
    );
  });
});

describe("S66 audience separation and completion proof", () => {
  it("puts every tenant in the tenant packet and no owner content", () => {
    const result = evaluateRenewalPacket(readyS66Input());
    expect(
      result.manifest?.participants.map((participant) => participant.participantId),
    ).toEqual(["fixture-tenant-a", "fixture-tenant-b"]);
    expect(
      result.manifest?.includedArtifacts.every(
        (artifact) => artifact.audience === "tenant",
      ),
    ).toBe(true);
  });

  it("requires exact authenticated all-tenant execution before owner acknowledgment", () => {
    const input = readyS66Input();
    input.audience = "owner";
    input.expectedTenantPacketHash = "a".repeat(64);
    input.tenantCompletionProof = {
      tenantPacketHash: "a".repeat(64),
      providerReceiptId: "fixture-provider-receipt",
      authenticatedReadback: false,
      allRequiredArtifactsExecuted: true,
      requiredTenantParticipantIds: ["fixture-tenant-a", "fixture-tenant-b"],
      executedTenantParticipantIds: ["fixture-tenant-a", "fixture-tenant-b"],
      readAt: "2026-08-10T14:00:00.000Z",
    };
    expect(evaluateRenewalPacket(input).state).toBe("Needs input");

    input.tenantCompletionProof.authenticatedReadback = true;
    const ready = evaluateRenewalPacket(input);
    expect(ready.state).toBe("Ready for preview");
    expect(
      ready.manifest?.participants.map((participant) => participant.participantId),
    ).toEqual(["fixture-owner-a", "fixture-owner-b"]);
    expect(ready.manifest?.includedArtifacts).toEqual([
      expect.objectContaining({ kind: "owner_acknowledgment", audience: "owner" }),
    ]);
    expect(ready.manifest?.charges).toEqual([]);
    expect(ready.manifest?.animals).toEqual([]);
  });
});
