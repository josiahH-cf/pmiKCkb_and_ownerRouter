import { describe, expect, it } from "vitest";

import {
  buildFillWorksheet,
  slotCapacityIssues,
} from "@/lib/lease-documents/artifact-intake";
import type { ArtifactFieldMap } from "@/lib/lease-documents/artifact-intake-contract";
import { emptyArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import { resolveFamilyUse } from "@/lib/lease-documents/family-use";
import { projectLeasePacketReadiness } from "@/lib/lease-documents/lease-packet-readiness";
import {
  packetInputParties,
  type PacketInputsRecord,
} from "@/lib/lease-documents/packet-inputs";
import {
  EXECUTED_NOTE,
  projectShownPacketState,
  type ShownPacketDocument,
} from "@/lib/lease-documents/packet-shown-state";
import { projectSelectionFreshness } from "@/lib/lease-documents/packet-selection-freshness";
import type {
  PacketAnimal,
  PacketEvaluation,
  RenewalPacketSnapshot,
} from "@/lib/lease-documents/packet-types";

// S235 R-S235-3 (BEH-S235-2, AC-S235-3), R-S235-4 (BEH-S235-3, AC-S235-4) and R-S235-6 (BEH-S235-5).
// Synthetic people, animals, maps, records and Dotloop ids only; no field name, coordinate, signer
// capacity or legal text is invented for a real form.

const AT = "2026-10-28T15:00:00.000Z";
const id = (n: number) =>
  `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;

function record(people: PacketInputsRecord["people"]["entries"]): PacketInputsRecord {
  return {
    schemaVersion: "packet-inputs/v1",
    leaseId: "4821",
    revision: 1,
    facts: {},
    people: { revision: 1, entries: people, updatedAt: AT, updatedByUid: "staff" },
    animals: { revision: 0, entries: [] },
    chargeOverrides: { revision: 0, entries: [] },
    updatedAt: AT,
    updatedByUid: "staff",
  } as unknown as PacketInputsRecord;
}

const tenant = (n: number, order: number, fullName = "Sam Example") => ({
  personId: id(n),
  kind: "person" as const,
  fullName,
  // The same name and email on two people never merges them.
  email: "shared@fixture-rental.net",
  emailBasis: "staff_reviewed" as const,
  contactRef: null,
  roles: [{ signerRole: "tenant" as const, order, dotloopRole: "TENANT" as const }],
});
const owner = (
  n: number,
  order: number,
  fullName: string,
  kind: "person" | "organization",
) => ({
  personId: id(n),
  kind,
  fullName,
  email: null,
  emailBasis: null,
  contactRef: null,
  roles: [{ signerRole: "owner" as const, order, dotloopRole: "LANDLORD" as const }],
});
const animal = (animalId: string, name: string): PacketAnimal => ({
  animalId,
  facts: [
    {
      key: "name",
      value: name,
      source: { system: "renewal_staff_entry", reference: animalId, retrievedAt: AT },
      confidence: "Verified",
    },
  ],
  agreementApplicable: true,
  chargeIds: [],
});

function map(
  audience: "tenant" | "owner",
  partySlots: number,
  animalSlots: number,
): ArtifactFieldMap {
  return {
    schemaVersion: "artifact-field-map/v1",
    artifactKind: audience === "tenant" ? "renewal_extension" : "owner_acknowledgment",
    mapVersion: "synthetic-v1",
    templateVersion: "publication:synthetic-1",
    formFamily: "synthetic-family",
    formFamilyExtensionCompatible: true,
    audience,
    allowedPacketContexts: ["renewal_extension"],
    fields: [
      {
        fieldId: "Party name",
        factKey: "party.name",
        meaning: "Synthetic party name",
        required: true,
        multiplicity: "per_party",
        pdfFieldNames: Array.from({ length: partySlots }, (_, n) => `Party ${n + 1}`),
        allowedSourceSystems: ["renewal_staff_entry"],
      },
      ...(animalSlots
        ? [
            {
              fieldId: "Animal name",
              factKey: "animal.name",
              meaning: "Synthetic animal name",
              required: false,
              multiplicity: "per_animal" as const,
              pdfFieldNames: Array.from(
                { length: animalSlots },
                (_, n) => `Animal ${n + 1}`,
              ),
              allowedSourceSystems: ["renewal_staff_entry"],
            },
          ]
        : []),
    ],
    signers: [
      {
        signerRole: "tenant",
        participantKind: "tenant",
        required: true,
        location: "Signature",
      },
    ],
    reviewNote: "SYNTHETIC review",
  } as ArtifactFieldMap;
}

describe("S235 R-S235-3 party and animal slots", () => {
  it("fills two co-tenants and two animals into four distinct slots in role and recorded order", () => {
    const parties = packetInputParties(
      record([tenant(2, 2, "Sam Example"), tenant(1, 1, "Sam Example")]),
    );
    const worksheet = buildFillWorksheet(map("tenant", 2, 2), {
      facts: parties.facts,
      participants: parties.participants,
      animals: [animal("animal-a", "Rex"), animal("animal-b", "Bo")],
    });
    expect(worksheet.rows.map((row) => [row.location, row.value])).toEqual([
      [`Party name[${parties.participants[1].participantId}]`, "Sam Example"],
      [`Party name[${parties.participants[0].participantId}]`, "Sam Example"],
      ["Animal name[animal-a]", "Rex"],
      ["Animal name[animal-b]", "Bo"],
    ]);
    // Role order 1 then 2, by identity, although the display names and emails are identical.
    expect(new Set(worksheet.rows.slice(0, 2).map((row) => row.location)).size).toBe(2);
    expect(slotCapacityIssues(map("tenant", 2, 2), { parties: 2, animals: 2 })).toEqual(
      [],
    );
  });

  it("keeps an organization owner and a person owner in distinct slots in role order", () => {
    const parties = packetInputParties(
      record([
        owner(3, 2, "Alex Example", "person"),
        owner(4, 1, "Example Owner LLC", "organization"),
      ]),
    );
    const worksheet = buildFillWorksheet(map("owner", 2, 0), {
      facts: parties.facts,
      participants: parties.participants,
      animals: [],
    });
    expect(worksheet.rows.map((row) => row.value)).toEqual([
      "Example Owner LLC",
      "Alex Example",
    ]);
  });

  it("refuses more parties or animals than places with the places message, and shows it in readiness", () => {
    expect(slotCapacityIssues(map("tenant", 2, 2), { parties: 2, animals: 3 })).toEqual([
      "This form has places for 2 animals; 3 are recorded.",
    ]);
    expect(slotCapacityIssues(map("tenant", 1, 0), { parties: 2, animals: 0 })).toEqual([
      "This form has places for 1 party; 2 are recorded.",
    ]);
    const manifest = emptyArtifactIntakeManifest();
    const rows = projectLeasePacketReadiness({
      manifest: {
        ...manifest,
        entries: {
          ...manifest.entries,
          renewal_extension: {
            id: "renewal_extension",
            kind: "renewal_extension",
            state: "approved",
            revision: 1,
            fieldMap: map("tenant", 2, 2),
            updated_at: AT,
          },
        },
      },
      evaluation: {
        manifest: {
          includedArtifacts: [],
          excludedArtifacts: [],
          participants: [1, 2].map((n) => ({ kind: "tenant", participantId: `p${n}` })),
          animals: ["a", "b", "c"].map((animalId) => animal(animalId, animalId)),
        },
      } as unknown as PacketEvaluation,
      familyUse: { readable: true, families: resolveFamilyUse(null, AT) },
    });
    expect(rows.find((row) => row.kind === "renewal_extension")?.missing).toContain(
      "This form has places for 2 animals; 3 are recorded. An approved form or attachment with room for everyone (client document approver)",
    );
  });
});

const snapshot = (
  overrides: Partial<RenewalPacketSnapshot> = {},
): RenewalPacketSnapshot =>
  ({
    snapshotId: "packet_a",
    current: true,
    state: "Ready for preview",
    visibleState: "Ready for preview",
    ...overrides,
  }) as RenewalPacketSnapshot;
const doc = (overrides: Partial<ShownPacketDocument> = {}): ShownPacketDocument => ({
  artifactId: "a",
  fillable: true,
  unchanged: false,
  prepared: false,
  approved: false,
  uploaded: false,
  uploadPending: false,
  ...overrides,
});

describe("S235 R-S235-4 packet state from recorded events", () => {
  it("advances only on each recorded event, and Executed says it is not signatures", () => {
    const two = (a: Partial<ShownPacketDocument>, b: Partial<ShownPacketDocument>) => [
      doc({ artifactId: "a", ...a }),
      doc({ artifactId: "b", ...b }),
    ];
    const at = (documents: ShownPacketDocument[], overrides = {}) =>
      projectShownPacketState({ snapshot: snapshot(overrides), documents });
    expect(at(two({}, {})).state).toBe("Ready for preview");
    expect(at(two({ prepared: true }, {})).state).toBe("Ready for preview");
    expect(at(two({ prepared: true }, { prepared: true })).state).toBe("Previewed");
    expect(at(two({ prepared: true, approved: true }, { prepared: true })).state).toBe(
      "Previewed",
    );
    const approved = { prepared: true, approved: true };
    expect(at(two(approved, approved)).state).toBe("Approved");
    expect(at(two(approved, { ...approved, uploadPending: true })).state).toBe(
      "Provider pending",
    );
    expect(at(two({ ...approved, uploaded: true }, approved))).toMatchObject({
      state: "Partially executed",
      note: "1 of 2 documents are current in the linked loop.",
    });
    expect(
      at(two({ ...approved, uploaded: true }, { ...approved, uploaded: true })),
    ).toEqual({
      snapshotId: "packet_a",
      state: "Executed",
      note: EXECUTED_NOTE,
    });
    expect(EXECUTED_NOTE).toMatch(/not that anyone signed/);
  });

  it("shows Failed, Cancelled, Superseded and unready states from their records, never skipping one", () => {
    const approved = [doc({ prepared: true, approved: true })];
    const state = (overrides: Partial<RenewalPacketSnapshot>, documents = approved) =>
      projectShownPacketState({ snapshot: snapshot(overrides), documents }).state;
    expect(
      state({
        execution: { idempotencyKey: "k", state: "Failed" },
      } as Partial<RenewalPacketSnapshot>),
    ).toBe("Failed");
    expect(
      state({
        execution: { idempotencyKey: "k", state: "Cancelled" },
      } as Partial<RenewalPacketSnapshot>),
    ).toBe("Cancelled");
    expect(state({ current: false })).toBe("Superseded");
    expect(state({ state: "Needs input" })).toBe("Needs input");
    // A loop created before any upload is partial; Executed never appears with an upload missing.
    expect(
      state({
        execution: { idempotencyKey: "k", state: "Partially executed" },
      } as Partial<RenewalPacketSnapshot>),
    ).toBe("Partially executed");
    expect(state({}, [doc({ uploaded: true }), doc({ artifactId: "b" })])).not.toBe(
      "Executed",
    );
    // A person-completed document keeps the packet short of Approved; an unchanged one counts.
    expect(
      state({}, [
        doc({ prepared: true, approved: true }),
        doc({ artifactId: "m", fillable: false }),
      ]),
    ).toBe("Previewed");
    expect(
      state({}, [
        doc({ prepared: true, approved: true }),
        doc({ artifactId: "u", fillable: false, unchanged: true }),
      ]),
    ).toBe("Approved");
  });
});

const settings = {
  version: 3,
  profileId: "profile-1",
  profileLabel: "PMI KC renewals",
  templateId: "template-9",
  templateLabel: "Renewal loop",
  transactionType: "LISTING_FOR_LEASE" as const,
  initialStatus: "PRE_LISTING",
  recordedAtIso: "2026-10-20T15:00:00.000Z",
  recordedByUid: "admin",
};
const observation = (overrides: Record<string, unknown> = {}) => ({
  generationId: "g1",
  observedAt: "2026-10-28T14:00:00.000Z",
  accountOk: true,
  accountEmail: "integrations@pmikcmetro.com",
  profiles: [{ id: "profile-1", name: "PMI KC renewals", type: "INDIVIDUAL" }],
  profilesOk: true,
  templates: [
    {
      profileId: "profile-1",
      ok: true,
      templates: [
        { id: "template-9", name: "Renewal loop", transactionType: "LISTING_FOR_LEASE" },
      ],
    },
  ],
  subscriptionsReadable: null,
  failures: [] as string[],
  ...overrides,
});

describe("S235 R-S235-6 selection freshness", () => {
  const freshness = (
    overrides: Partial<Parameters<typeof projectSelectionFreshness>[0]> = {},
  ) =>
    projectSelectionFreshness({
      settings,
      settingsReadable: true,
      observation: observation(),
      observationReadable: true,
      nowIso: "2026-10-28T15:00:00.000Z",
      ...overrides,
    });

  it("shows the saved selection with the last observation time and no problem when it matches", () => {
    const result = freshness();
    expect(result.selection).toBe(
      "Saved selection version 3: profile PMI KC renewals, template Renewal loop, transaction type LISTING_FOR_LEASE, initial status PRE_LISTING, saved Oct 20, 2026, 10:00 AM Central.",
    );
    expect(result.observation).toBe(
      "Last resource observation: Oct 28, 2026, 9:00 AM Central.",
    );
    expect(result.problems).toEqual([]);
  });

  it("names a stale, failed or regressed observation, and a missing or unreadable selection", () => {
    expect(freshness({ nowIso: "2026-10-30T15:00:00.000Z" }).problems).toEqual([
      "The latest resource observation is older than one day; an Admin refreshes resources in Connections.",
    ]);
    expect(
      freshness({
        observation: observation({
          failures: [
            "The latest resource observation could not read the Dotloop profiles.",
          ],
          profilesOk: false,
        }),
      }).problems,
    ).toEqual([
      "The latest resource observation could not read the Dotloop profiles.",
      "The saved profile could not be checked because the latest observation did not read it.",
    ]);
    expect(
      freshness({
        observation: observation({
          templates: [{ profileId: "profile-1", ok: true, templates: [] }],
        }),
      }).problems,
    ).toEqual(["The saved template is missing from the latest resource observation."]);
    expect(freshness({ settings: null }).problems).toEqual([
      "An Admin saves the Dotloop profile and template in Connections.",
    ]);
    expect(freshness({ settingsReadable: false, settings: null }).selection).toBe(
      "The saved Dotloop selection could not be read.",
    );
    expect(freshness({ observation: null }).problems).toEqual([
      "No Dotloop resource observation is recorded; an Admin refreshes resources in Connections.",
    ]);
  });
});
