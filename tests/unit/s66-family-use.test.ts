import { describe, expect, it } from "vitest";

import { LEASE_ARTIFACT_FAMILIES } from "@/lib/lease-documents/artifact-catalog";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import {
  DEFAULT_FAMILY_USE,
  nextFamilyUseRecord,
  resolveFamilyUse,
} from "@/lib/lease-documents/family-use";
import type {
  FormFamilyUse,
  LeaseArtifactKind,
  PacketEvaluationInput,
} from "@/lib/lease-documents/packet-types";
import { readyS66Input, s66Fact } from "@/tests/fixtures/s66-packet";

const NOW = "2026-10-07T00:00:00.000Z";

function withUse(
  input: PacketEvaluationInput,
  uses: Partial<Record<LeaseArtifactKind, FormFamilyUse["use"]>>,
  options: { dropArtifacts?: LeaseArtifactKind[] } = {},
): PacketEvaluationInput {
  const familyUse = resolveFamilyUse(null, NOW).map((entry) =>
    uses[entry.kind] ? { ...entry, use: uses[entry.kind]! } : entry,
  );
  return {
    ...input,
    catalog: {
      ...input.catalog,
      requirements: [...LEASE_ARTIFACT_FAMILIES],
      familyUse,
      artifacts: input.catalog.artifacts.filter(
        (artifact) => !(options.dropArtifacts ?? []).includes(artifact.kind),
      ),
    },
  };
}

describe("S66 configurable form-family use (AC-S66-6, ARCH-S66-2)", () => {
  it("represents all eight reference types alongside the city and HOA families, labeled as engineering defaults", () => {
    const families = resolveFamilyUse(null, NOW);
    expect(families.map((family) => family.kind)).toEqual([
      "standard_lease",
      "renewal_extension",
      "animal_agreement",
      "lead_disclosure",
      "city_addendum",
      "hoa_artifact",
      "owner_acknowledgment",
      "kcrar_additional_disclosures",
      "brokerage_disclosure",
      "insurance_program_addendum",
    ]);
    expect(
      families.every((family) => family.source.system === "engineering_default"),
    ).toBe(true);
    expect(DEFAULT_FAMILY_USE.kcrar_additional_disclosures).toBe("not_used");
    const record = nextFamilyUseRecord(
      null,
      {
        kind: "kcrar_additional_disclosures",
        use: "mandatory",
        expectedVersion: 0,
        operationId: "70000000-0000-4000-8000-000000000001",
      },
      "admin-1",
      NOW,
    );
    expect(
      resolveFamilyUse(record, NOW).find(
        (family) => family.kind === "kcrar_additional_disclosures",
      ),
    ).toMatchObject({
      use: "mandatory",
      source: {
        system: "lease_artifact_family_use",
        reference: "family-use:kcrar_additional_disclosures:v1",
      },
    });
  });

  it("does not hold a valid packet for unrelated missing families, and lists them for review", () => {
    // No approved animal, city, HOA or KCRAR material at all; none applies to this lease.
    const input = readyS66Input();
    input.facts.push(
      s66Fact("property.city_addendum_required", false, "renewal_staff_entry"),
      s66Fact("property.hoa_governed", false, "renewal_staff_entry"),
    );
    const evaluation = evaluateRenewalPacket(
      withUse(
        input,
        {},
        {
          dropArtifacts: ["animal_agreement", "city_addendum", "hoa_artifact"],
        },
      ),
    );
    expect(
      evaluation.blockers.filter((blocker) => blocker.code === "artifact_unavailable"),
    ).toEqual([]);
    expect(
      evaluation.manifest?.excludedArtifacts
        .map((artifact) => [artifact.kind, artifact.ruleResult])
        .sort(),
    ).toEqual([
      ["animal_agreement", "Not applicable"],
      ["brokerage_disclosure", "Not applicable"],
      ["city_addendum", "Not applicable"],
      ["hoa_artifact", "Not applicable"],
      ["insurance_program_addendum", "Not applicable"],
      ["kcrar_additional_disclosures", "Not applicable"],
      ["lead_disclosure", "Not applicable"],
    ]);
  });

  it("holds the packet for a required family without material and for unknown applicability, with the exact question", () => {
    const required = evaluateRenewalPacket(
      withUse(readyS66Input(), { kcrar_additional_disclosures: "mandatory" }),
    );
    expect(required.blockers).toContainEqual(
      expect.objectContaining({
        code: "artifact_unavailable",
        scope: "kcrar_additional_disclosures",
      }),
    );
    const conditional = evaluateRenewalPacket(
      withUse(readyS66Input(), { brokerage_disclosure: "conditional" }),
    );
    // No reviewed rule and no default: the family applies only when a person records that it does.
    expect(conditional.blockers).toContainEqual(
      expect.objectContaining({
        code: "missing_fact",
        fieldKey: "family.brokerage_disclosure.applicable",
      }),
    );
    expect(
      conditional.manifest?.excludedArtifacts.find(
        (artifact) => artifact.kind === "brokerage_disclosure",
      ),
    ).toMatchObject({ ruleResult: "Needs input" });
    const answered = evaluateRenewalPacket(
      withUse(
        {
          ...readyS66Input(),
          facts: [
            ...readyS66Input().facts,
            s66Fact(
              "family.brokerage_disclosure.applicable",
              false,
              "renewal_staff_entry",
            ),
          ],
        },
        { brokerage_disclosure: "conditional" },
      ),
    );
    expect(
      answered.blockers.filter((blocker) => blocker.scope === "brokerage_disclosure"),
    ).toEqual([]);
  });

  it("keeps a family the configuration does not use out of the packet even when its material exists", () => {
    const evaluation = evaluateRenewalPacket(
      withUse(readyS66Input(), { lead_disclosure: "not_used" }),
    );
    expect(
      evaluation.manifest?.includedArtifacts.map((artifact) => artifact.kind),
    ).toEqual(["renewal_extension"]);
    expect(
      evaluation.manifest?.excludedArtifacts.find(
        (artifact) => artifact.kind === "lead_disclosure",
      ),
    ).toMatchObject({
      ruleResult: "Not applicable",
      reason: "Not used by the approved form configuration.",
    });
  });

  it("keeps tenant and owner audiences distinct", () => {
    const input = withUse(readyS66Input(), {});
    const tenant = evaluateRenewalPacket(input);
    expect(
      tenant.manifest?.includedArtifacts.every(
        (artifact) => artifact.audience === "tenant",
      ),
    ).toBe(true);
    const owner = evaluateRenewalPacket({ ...input, audience: "owner" });
    expect(owner.packetContext).toBe("owner_acknowledgment");
    expect(
      owner.manifest?.includedArtifacts.some(
        (artifact) => artifact.audience === "tenant",
      ),
    ).toBe(false);
  });

  it("leaves a legacy catalog without family use on its original rule", () => {
    const legacy = readyS66Input();
    legacy.catalog.artifacts = legacy.catalog.artifacts.filter(
      (artifact) => artifact.kind !== "city_addendum",
    );
    const evaluation = evaluateRenewalPacket(legacy);
    expect(evaluation.blockers).toContainEqual(
      expect.objectContaining({ code: "artifact_unavailable", scope: "city_addendum" }),
    );
  });
});
