import { describe, expect, it } from "vitest";

import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  packetInputFacts,
  packetInputParties,
  planPacketInputsSave,
  SavePacketInputsSchema,
  type PacketInputsRecord,
  type PacketPersonInput,
} from "@/lib/lease-documents/packet-inputs";
import { readyS66Input } from "@/tests/fixtures/s66-packet";

const LEASE = "701";
const META = (n: number) => ({
  actorUid: `editor-${n}`,
  nowIso: `2026-10-07T0${n}:00:00.000Z`,
  eventId: `00000000-0000-4000-8000-00000000000${n}`,
});
const OP = (n: number) => `10000000-0000-4000-8000-00000000000${n}`;
const PERSON = (n: number) => `20000000-0000-4000-8000-00000000000${n}`;
const ANIMAL = (n: number) => `30000000-0000-4000-8000-00000000000${n}`;

function save(current: PacketInputsRecord | null, body: Record<string, unknown>, n = 1) {
  return planPacketInputsSave(
    current,
    { leaseId: LEASE, operationId: OP(n), ...body } as never,
    META(n),
  );
}

function person(
  n: number,
  fullName: string,
  roles: PacketPersonInput["roles"],
  email: string | null = `person${n}@fixture-rental.net`,
): PacketPersonInput {
  return {
    personId: PERSON(n),
    kind: "person",
    fullName,
    email,
    emailBasis: email ? "staff_reviewed" : null,
    contactRef: null,
    roles,
  };
}

describe("S66 packet inputs: staff enter facts, people and animals once (AC-S66-1, AC-S66-4, AC-S66-5)", () => {
  it("saves a staff fact with its own actor, time and revision and projects it as a verified packet fact", () => {
    const { record, changed } = save(null, {
      facts: [{ fieldKey: "property.year_built", expectedRevision: 0, value: 1965 }],
    });
    expect(changed).toEqual(["fact:property.year_built"]);
    expect(record.revision).toBe(1);
    expect(record.facts["property.year_built"]).toMatchObject({
      value: 1965,
      displayValue: "1965",
      revision: 1,
      recordedByUid: "editor-1",
      recordedAt: "2026-10-07T01:00:00.000Z",
      origin: "staff_entry",
    });
    expect(packetInputFacts(record)).toEqual([
      expect.objectContaining({
        fieldKey: "property.year_built",
        normalizedValue: 1965,
        confidence: "Verified",
        verifiedBy: "editor-1",
        blockingScope: "lead_disclosure",
        source: expect.objectContaining({
          system: "renewal_staff_entry",
          retrievedAt: "2026-10-07T01:00:00.000Z",
          version: "1",
        }),
      }),
    ]);
  });

  it("refuses a stale fact revision with the field named and applies nothing from that save", () => {
    const first = save(null, {
      facts: [
        { fieldKey: "landlord.legal_entity", expectedRevision: 0, value: "Owner A LLC" },
      ],
    }).record;
    const second = save(
      first,
      {
        facts: [
          {
            fieldKey: "landlord.legal_entity",
            expectedRevision: 1,
            value: "Owner B LLC",
          },
        ],
      },
      2,
    ).record;
    expect(() =>
      save(
        second,
        {
          facts: [
            { fieldKey: "property.year_built", expectedRevision: 0, value: 1990 },
            {
              fieldKey: "landlord.legal_entity",
              expectedRevision: 1,
              value: "Owner C LLC",
            },
          ],
        },
        3,
      ),
    ).toThrow(/Another operator changed Landlord legal entity/);
    // An unrelated fact saved on its own stays usable while the conflicting one is reviewed.
    const unrelated = save(
      second,
      { facts: [{ fieldKey: "property.year_built", expectedRevision: 0, value: 1990 }] },
      4,
    ).record;
    expect(unrelated.facts["landlord.legal_entity"].value).toBe("Owner B LLC");
    expect(unrelated.facts["property.year_built"].value).toBe(1990);
  });

  it("keeps attribution on an unchanged save and requires a reason to replace a source value", () => {
    const first = save(null, {
      facts: [{ fieldKey: "active_lease.executed", expectedRevision: 0, value: true }],
    }).record;
    const same = save(
      first,
      {
        facts: [{ fieldKey: "active_lease.executed", expectedRevision: 1, value: true }],
      },
      2,
    );
    expect(same.changed).toEqual([]);
    expect(same.record.facts["active_lease.executed"].recordedByUid).toBe("editor-1");
    expect(() =>
      save(
        first,
        {
          facts: [
            {
              fieldKey: "property.address",
              expectedRevision: 0,
              value: "100 Corrected St",
              overridesSource: true,
            },
          ],
        },
        3,
      ),
    ).toThrow(/Say why this value replaces the current source value/);
    expect(() =>
      save(
        first,
        {
          facts: [
            {
              fieldKey: "property.address",
              expectedRevision: 0,
              value: "100 Source St",
              origin: "adopted_source",
            },
          ],
        },
        3,
      ),
    ).toThrow(/Name the source/);
  });

  it("validates typed facts instead of storing a guessed value", () => {
    expect(() =>
      save(null, {
        facts: [
          { fieldKey: "insurance.coverage_method", expectedRevision: 0, value: "maybe" },
        ],
      }),
    ).toThrow(/Renter's insurance: choose one of the listed options/);
    expect(() =>
      save(null, {
        facts: [
          {
            fieldKey: "renewal.return_by_date",
            expectedRevision: 0,
            value: "2027-02-30",
          },
        ],
      }),
    ).toThrow(/enter a valid date/);
    expect(() =>
      save(null, {
        facts: [{ fieldKey: "property.hoa_governed", expectedRevision: 0, value: "yes" }],
      }),
    ).toThrow(/choose Yes or No/);
    // S34: the structured address a new Dotloop loop carries keeps its reviewed format.
    expect(() =>
      save(null, {
        facts: [{ fieldKey: "property.state", expectedRevision: 0, value: "Missouri" }],
      }),
    ).toThrow(/enter the two-letter state/);
    expect(() =>
      save(null, {
        facts: [{ fieldKey: "property.zip", expectedRevision: 0, value: "6411" }],
      }),
    ).toThrow(/enter a five-digit ZIP code/);
    const address = save(null, {
      facts: [
        { fieldKey: "property.street_line", expectedRevision: 0, value: "1 Fixture St" },
        { fieldKey: "property.city", expectedRevision: 0, value: "Kansas City" },
        { fieldKey: "property.state", expectedRevision: 0, value: "MO" },
        { fieldKey: "property.zip", expectedRevision: 0, value: "64105" },
      ],
    });
    expect(address.record.facts["property.zip"]?.value).toBe("64105");
  });

  it("keeps people apart from signer roles: one person may hold several roles, a PMI manager is never the owner", () => {
    const { record } = save(null, {
      people: {
        expectedRevision: 0,
        entries: [
          person(1, "Tenant One", [
            { signerRole: "tenant", order: 1, dotloopRole: "TENANT" },
          ]),
          person(2, "Tenant Two", [
            { signerRole: "tenant", order: 2, dotloopRole: "TENANT" },
          ]),
          person(3, "Owner One", [
            { signerRole: "owner", order: 1, dotloopRole: "LANDLORD" },
          ]),
          person(4, "Owner Two", [
            { signerRole: "owner", order: 2, dotloopRole: "LANDLORD" },
          ]),
          person(5, "Manager Broker", [
            { signerRole: "property_manager", order: 1, dotloopRole: "PROPERTY_MANAGER" },
            { signerRole: "broker", order: 1, dotloopRole: "MANAGING_BROKER" },
          ]),
          person(
            6,
            "Guarantor One",
            [{ signerRole: "guarantor", order: 1, dotloopRole: "OTHER" }],
            null,
          ),
        ],
      },
    });
    const parties = packetInputParties(record);
    expect(
      parties.participants.map((participant) => [
        participant.participantId,
        participant.kind,
        participant.signerRole,
      ]),
    ).toEqual([
      [`${PERSON(1)}:tenant`, "tenant", "tenant"],
      [`${PERSON(2)}:tenant`, "tenant", "tenant"],
      [`${PERSON(3)}:owner`, "owner", "owner"],
      [`${PERSON(4)}:owner`, "owner", "owner"],
      [`${PERSON(5)}:property_manager`, "agent", "property_manager"],
      [`${PERSON(5)}:broker`, "agent", "broker"],
      [`${PERSON(6)}:guarantor`, "guarantor", "guarantor"],
    ]);
    expect(
      parties.participants
        .filter((participant) => participant.kind === "tenant")
        .map((participant) => participant.authoritativeOrder),
    ).toEqual([1, 2]);
    // The guarantor has no reviewed email: a participant for filled files, no handoff contact.
    expect(parties.contacts.map((contact) => contact.participantRef)).not.toContain(
      `${PERSON(6)}:guarantor`,
    );
    expect(parties.contacts).toContainEqual(
      expect.objectContaining({
        participantRef: `${PERSON(5)}:broker`,
        role: "MANAGING_BROKER",
        email: "person5@fixture-rental.net",
      }),
    );
    expect(parties.facts).toContainEqual(
      expect.objectContaining({
        fieldKey: `party.${PERSON(2)}:tenant.name`,
        normalizedValue: "Tenant Two",
      }),
    );
  });

  it("refuses a duplicated slot, a gap in order, or an email without its basis", () => {
    expect(() =>
      save(null, {
        people: {
          expectedRevision: 0,
          entries: [
            person(1, "A", [{ signerRole: "tenant", order: 1, dotloopRole: "TENANT" }]),
            person(2, "B", [{ signerRole: "tenant", order: 1, dotloopRole: "TENANT" }]),
          ],
        },
      }),
    ).toThrow(/Two people hold Tenant position 1/);
    expect(() =>
      save(null, {
        people: {
          expectedRevision: 0,
          entries: [
            person(1, "A", [{ signerRole: "tenant", order: 2, dotloopRole: "TENANT" }]),
          ],
        },
      }),
    ).toThrow(/positions must run 1, 2, 3 without a gap/);
    expect(() =>
      save(null, {
        people: {
          expectedRevision: 0,
          entries: [
            {
              ...person(1, "A", [
                { signerRole: "tenant", order: 1, dotloopRole: "TENANT" },
              ]),
              emailBasis: null,
            },
          ],
        },
      }),
    ).toThrow(/Record where A's email comes from/);
  });

  it("refuses a stale people list and keeps the earlier list", () => {
    const first = save(null, {
      people: {
        expectedRevision: 0,
        entries: [
          person(1, "A", [{ signerRole: "tenant", order: 1, dotloopRole: "TENANT" }]),
        ],
      },
    }).record;
    expect(() =>
      save(first, { people: { expectedRevision: 0, entries: [] } }, 2),
    ).toThrow(/Another operator changed the people and signer roles/);
    expect(first.people.entries).toHaveLength(1);
  });

  it("names excess or missing signers against the reviewed map instead of dropping anyone", () => {
    const fixture = readyS66Input();
    const catalog = fixture.catalog;
    for (const artifact of catalog.artifacts) {
      artifact.signerRoles = [artifact.audience];
      if (artifact.kind === "renewal_extension")
        artifact.fillMapping = {
          map: {
            signers: [
              {
                signerRole: "tenant",
                participantKind: "tenant",
                required: true,
                location: "Tenant 1",
              },
            ],
          } as never,
          mapHash: "f".repeat(64),
          intakeRevision: 1,
        };
    }
    const people = (count: number) =>
      packetInputParties(
        save(null, {
          people: {
            expectedRevision: 0,
            entries: Array.from({ length: count }, (_, index) =>
              person(index + 1, `Tenant ${index + 1}`, [
                { signerRole: "tenant", order: index + 1, dotloopRole: "TENANT" },
              ]),
            ),
          },
        }).record,
      ).participants;
    const two = evaluateRenewalPacket({ ...fixture, participants: people(2), catalog });
    expect(two.blockers.map((blocker) => blocker.label)).toContain(
      "Fixture renewal extension has 1 tenant signature slot for 2 people. An approved form or attachment with room for everyone is required.",
    );
    expect(two.manifest?.participants).toHaveLength(2);
    const one = evaluateRenewalPacket({ ...fixture, participants: people(1), catalog });
    expect(
      one.blockers.filter((blocker) => blocker.scope === "tenant_participants"),
    ).toEqual([]);
  });

  it("feeds an ordinary evaluation: staff people satisfy the tenant side without a hand-written mapping", () => {
    const { record } = save(null, {
      people: {
        expectedRevision: 0,
        entries: [
          person(1, "Tenant One", [
            { signerRole: "tenant", order: 1, dotloopRole: "TENANT" },
          ]),
        ],
      },
      animals: {
        expectedRevision: 0,
        entries: [
          {
            animalId: ANIMAL(1),
            name: "Rex",
            species: "Dog",
            breed: "Mixed",
            weight: 40,
            weightUnit: "lb",
            weightBasis: "current",
            maturity: "adult",
            fidoScore: null,
            treatment: null,
          },
        ],
      },
    });
    const fixture = readyS66Input();
    const catalog = fixture.catalog;
    for (const artifact of catalog.artifacts) artifact.signerRoles = [artifact.audience];
    const evaluation = evaluateRenewalPacket({
      ...fixture,
      participants: packetInputParties(record).participants,
      catalog,
    });
    expect(
      evaluation.blockers.filter((blocker) => blocker.scope === "tenant_participants"),
    ).toEqual([]);
    expect(evaluation.manifest?.participants.map((entry) => entry.participantId)).toEqual(
      [`${PERSON(1)}:tenant`],
    );
  });

  it("keeps a cleared fact's revision so an editor that read the earlier value is refused after re-entry", () => {
    const set = save(null, {
      facts: [
        { fieldKey: "landlord.legal_entity", expectedRevision: 0, value: "Foo LLC" },
      ],
    }).record;
    // Operator B read "Foo LLC" at revision 1. Operator A clears it and enters "Bar LLC".
    const cleared = save(
      set,
      {
        facts: [{ fieldKey: "landlord.legal_entity", expectedRevision: 1, value: null }],
      },
      2,
    ).record;
    expect(cleared.facts["landlord.legal_entity"]).toBeUndefined();
    expect(cleared.clearedFacts?.["landlord.legal_entity"]).toMatchObject({
      revision: 2,
      recordedByUid: "editor-2",
    });
    expect(() =>
      save(
        cleared,
        {
          facts: [
            { fieldKey: "landlord.legal_entity", expectedRevision: 0, value: "Bar LLC" },
          ],
        },
        3,
      ),
    ).toThrow(/Another operator changed Landlord legal entity/);
    const reentered = save(
      cleared,
      {
        facts: [
          { fieldKey: "landlord.legal_entity", expectedRevision: 2, value: "Bar LLC" },
        ],
      },
      3,
    ).record;
    expect(reentered.facts["landlord.legal_entity"]).toMatchObject({
      value: "Bar LLC",
      revision: 3,
    });
    expect(reentered.clearedFacts).toBeUndefined();
    // B's stale save against revision 1 never replaces A's newer value.
    expect(() =>
      save(
        reentered,
        {
          facts: [
            { fieldKey: "landlord.legal_entity", expectedRevision: 1, value: "Baz LLC" },
          ],
        },
        4,
      ),
    ).toThrow(/Another operator changed Landlord legal entity/);
  });

  it("refuses an impossible date and duplicate identities as a request error, never a failure", () => {
    for (const value of ["2026-13-01", "2026-01-32", "2026-02-30"]) {
      let caught: unknown;
      try {
        save(null, {
          facts: [{ fieldKey: "lease.original_date", expectedRevision: 0, value }],
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(EditableLayerError);
      expect((caught as EditableLayerError).status).toBe(400);
      expect((caught as Error).message).toBe("Original lease date: enter a valid date.");
    }
    const animal = {
      animalId: ANIMAL(1),
      name: "Rex",
      species: "Dog",
      breed: null,
      weight: 30,
      weightUnit: "lb",
      weightBasis: "current",
      maturity: "adult",
      fidoScore: null,
      treatment: "pet",
    };
    const duplicateAnimals = SavePacketInputsSchema.safeParse({
      leaseId: LEASE,
      operationId: OP(1),
      animals: { expectedRevision: 0, entries: [animal, { ...animal, name: "Max" }] },
    });
    expect(duplicateAnimals.success).toBe(false);
    expect(duplicateAnimals.error?.issues.map((issue) => issue.message)).toContain(
      "Each animal needs one distinct identity.",
    );
    const override = {
      chargeId: "insurance:monthly",
      amountCents: 1_000,
      reason: "Agreed rate",
    };
    const duplicateOverrides = SavePacketInputsSchema.safeParse({
      leaseId: LEASE,
      operationId: OP(1),
      chargeOverrides: { expectedRevision: 0, entries: [override, override] },
    });
    expect(duplicateOverrides.error?.issues.map((issue) => issue.message)).toContain(
      "One override per charge.",
    );
  });
});
