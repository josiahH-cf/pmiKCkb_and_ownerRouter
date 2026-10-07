import { describe, expect, it } from "vitest";

import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import {
  assemblePacketSources,
  rentVinePacketSource,
} from "@/lib/lease-documents/packet-assembly";
import { planPacketInputsSave } from "@/lib/lease-documents/packet-inputs";
import { readyS66Input } from "@/tests/fixtures/s66-packet";

const LEASE = "701";
const VIEW = {
  leaseID: 701,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  unit: { streetNumber: "100", streetName: "Fixture St", address2: "Unit 2" },
  tenants: [{ name: "Tenant One", email: "TENANT1@fixture-rental.net", contactID: 9 }],
};
const PERSON = "20000000-0000-4000-8000-000000000001";
const ANIMAL = "30000000-0000-4000-8000-000000000001";

function inputs(body: Record<string, unknown>) {
  return planPacketInputsSave(
    null,
    {
      leaseId: LEASE,
      operationId: "10000000-0000-4000-8000-000000000001",
      ...body,
    } as never,
    {
      actorUid: "editor-1",
      nowIso: "2026-10-07T01:00:00.000Z",
      eventId: "00000000-0000-4000-8000-000000000001",
    },
  ).record;
}

describe("S66 packet assembly from the lease's input owners (ARCH-S66-1, AC-S66-4)", () => {
  it("offers the current RentVine read as source values without making the packet depend on read time", () => {
    const first = rentVinePacketSource(VIEW as never, "2026-10-07T01:00:00.000Z");
    const later = rentVinePacketSource(VIEW as never, "2026-10-07T05:00:00.000Z");
    expect(first.facts.map((fact) => [fact.fieldKey, fact.normalizedValue])).toEqual([
      ["property.address", "100 Fixture St Unit 2"],
      ["lease.current_start_date", "2026-01-01"],
      ["lease.current_end_date", "2026-12-31"],
    ]);
    expect(first.parties).toEqual([
      expect.objectContaining({
        side: "tenant",
        name: "Tenant One",
        email: "tenant1@fixture-rental.net",
      }),
    ]);
    const assemble = (source: typeof first) =>
      assemblePacketSources({
        leaseId: LEASE,
        mapping: null,
        inputs: null,
        policy: null,
        source,
        approvedTermFacts: [],
      });
    const fixture = readyS66Input();
    const evaluate = (source: typeof first) =>
      evaluateRenewalPacket({
        ...fixture,
        facts: [...fixture.facts, ...assemble(source).facts],
      }).payloadHash;
    // An identical reread later evaluates to the same packet identity.
    expect(evaluate(first)).toBe(evaluate(later));
  });

  it("uses an adopted source value, raises a conflict when the source changes, and accepts a deliberate correction", () => {
    const source = rentVinePacketSource(VIEW as never, "2026-10-07T01:00:00.000Z");
    const adopted = inputs({
      facts: [
        {
          fieldKey: "property.address",
          expectedRevision: 0,
          value: "100 Fixture St Unit 2",
          origin: "adopted_source",
          sourceLabel: "RentVine lease 701",
        },
      ],
    });
    const current = assemblePacketSources({
      leaseId: LEASE,
      mapping: null,
      inputs: adopted,
      policy: null,
      source,
      approvedTermFacts: [],
    });
    expect(current.facts.filter((fact) => fact.fieldKey === "property.address")).toEqual([
      expect.objectContaining({
        normalizedValue: "100 Fixture St Unit 2",
        source: expect.objectContaining({ system: "renewal_staff_entry" }),
      }),
    ]);
    const moved = rentVinePacketSource(
      { ...VIEW, unit: { ...VIEW.unit, streetNumber: "200" } } as never,
      "2026-10-08T01:00:00.000Z",
    );
    const changed = assemblePacketSources({
      leaseId: LEASE,
      mapping: null,
      inputs: adopted,
      policy: null,
      source: moved,
      approvedTermFacts: [],
    });
    expect(changed.notices.join(" ")).toMatch(/RentVine now reports a different value/);
    const fixture = readyS66Input();
    const evaluation = evaluateRenewalPacket({
      ...fixture,
      facts: [...fixture.facts, ...changed.facts],
      catalog: {
        ...fixture.catalog,
        artifacts: fixture.catalog.artifacts.map((artifact) =>
          artifact.kind === "renewal_extension"
            ? {
                ...artifact,
                fieldBindings: [
                  ...artifact.fieldBindings,
                  {
                    fieldId: "Premises",
                    factKey: "property.address",
                    required: true,
                    allowedSourceSystems: ["renewal_staff_entry"],
                  },
                ],
              }
            : artifact,
        ),
      },
    });
    expect(evaluation.state).toBe("Conflict");
    expect(evaluation.blockers).toContainEqual(
      expect.objectContaining({ code: "conflicting_fact", fieldKey: "property.address" }),
    );
    const corrected = inputs({
      facts: [
        {
          fieldKey: "property.address",
          expectedRevision: 0,
          value: "100 Fixture St Unit 2",
          overridesSource: true,
          reason: "RentVine street number is a known typo; the lease shows 100.",
        },
      ],
    });
    const resolved = assemblePacketSources({
      leaseId: LEASE,
      mapping: null,
      inputs: corrected,
      policy: null,
      source: moved,
      approvedTermFacts: [],
    });
    expect(resolved.notices).toEqual(
      expect.not.arrayContaining([expect.stringMatching(/different value/)]),
    );
    expect(resolved.replacedSourceFacts.map((fact) => fact.normalizedValue)).toEqual([
      "200 Fixture St Unit 2",
    ]);
  });

  it("downgrades a person adopted from a source contact whose email no longer matches", () => {
    const source = rentVinePacketSource(VIEW as never, "2026-10-07T01:00:00.000Z");
    const adopted = (email: string) =>
      inputs({
        people: {
          expectedRevision: 0,
          entries: [
            {
              personId: PERSON,
              kind: "person",
              fullName: "Tenant One",
              email,
              emailBasis: "verified_contact",
              contactRef: source.parties[0].sourceRef,
              roles: [{ signerRole: "tenant", order: 1, dotloopRole: "TENANT" }],
            },
          ],
        },
      });
    const matching = assemblePacketSources({
      leaseId: LEASE,
      mapping: null,
      inputs: adopted("tenant1@fixture-rental.net"),
      policy: null,
      source,
      approvedTermFacts: [],
    });
    expect(matching.participants[0].confidence).toBe("Verified");
    expect(matching.contacts).toHaveLength(1);
    const stale = assemblePacketSources({
      leaseId: LEASE,
      mapping: null,
      inputs: adopted("old-address@fixture-rental.net"),
      policy: null,
      source,
      approvedTermFacts: [],
    });
    expect(stale.participants[0].confidence).toBe("Needs Review");
    expect(stale.contacts).toEqual([]);
    expect(stale.notices.join(" ")).toMatch(
      /contact this person was adopted from changed/,
    );
  });

  it("projects recorded animals with calculated charges and keeps a current Admin mapping's own sections", () => {
    const record = inputs({
      animals: {
        expectedRevision: 0,
        entries: [
          {
            animalId: ANIMAL,
            name: "Rex",
            species: "Dog",
            breed: "Mixed",
            weight: 30,
            weightUnit: "lb",
            weightBasis: "current",
            maturity: "adult",
            fidoScore: null,
            treatment: "pet",
          },
        ],
      },
    });
    const policy = {
      schemaVersion: "renewal-charge-policy/v1" as const,
      version: 2,
      effectiveFrom: "2026-10-01",
      content: {
        residentBenefitPackage: null,
        insuranceProgram: null,
        animals: {
          basis: "weight_lb" as const,
          tiers: [
            {
              tierId: "all",
              label: "Any weight",
              min: 0,
              maxExclusive: null,
              monthlyCents: 3_500,
              oneTimeCents: 0,
              refundableDepositCents: 20_000,
            },
          ],
          treatments: { pet: "tiered" as const, assistance_animal: "no_charge" as const },
          agreementFor: { pet: true, assistance_animal: true },
          juvenileWeightBasis: null,
        },
      },
      publishedAt: "2026-10-01T12:00:00.000Z",
      publishedByUid: "admin-1",
    };
    const assembled = assemblePacketSources({
      leaseId: LEASE,
      mapping: null,
      inputs: record,
      policy,
      source: { facts: [], parties: [] },
      approvedTermFacts: [],
    });
    expect(assembled.animals).toEqual([
      expect.objectContaining({
        animalId: ANIMAL,
        agreementApplicable: true,
        policyVersion: "2",
        chargeIds: [
          `animal:${ANIMAL}:monthly`,
          `animal:${ANIMAL}:one_time`,
          `animal:${ANIMAL}:refundable_deposit`,
        ],
      }),
    ]);
    expect(assembled.animals[0].facts.map((fact) => [fact.key, fact.value])).toEqual(
      expect.arrayContaining([
        ["species", "Dog"],
        ["policy_treatment", "Pet"],
        ["monthly_charge", 35],
        ["refundable_deposit", 200],
      ]),
    );
    const fixture = readyS66Input();
    const withMapping = assemblePacketSources({
      leaseId: LEASE,
      mapping: {
        facts: fixture.facts,
        participants: fixture.participants,
        charges: fixture.charges,
        animals: [],
        contacts: [],
      },
      inputs: record,
      policy,
      source: { facts: [], parties: [] },
      approvedTermFacts: [],
    });
    expect(withMapping.charges).toEqual(fixture.charges);
    expect(withMapping.calculated).toBeNull();
    expect(withMapping.participants).toEqual(fixture.participants);
  });
});
