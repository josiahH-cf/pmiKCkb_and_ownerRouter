import { describe, expect, it } from "vitest";

import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  OWNER_EXPLANATION_FACT,
  OWNER_EXPLANATION_MAX_LENGTH,
} from "@/lib/lease-documents/owner-explanation";
import {
  PacketAnimalInputSchema,
  PacketInputsRecordSchema,
  SavePacketInputsSchema,
  packetOwnerExplanationFact,
  planPacketInputsSave,
  type PacketAnimalInput,
  type PacketInputsRecord,
  type SavePacketInputs,
} from "@/lib/lease-documents/packet-inputs";

// S253 R-S253-3, R-S253-7, R-S253-12: the deposit staff record for a pet and the explanation they
// write for the owner are saved on that lease with who recorded them and when. Synthetic values.

const ANIMAL = "30000000-0000-4000-8000-000000000001";
const CYCLE = "c0000000-0000-4000-8000-000000000001";
const op = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const meta = (minute: number, actorUid = "editor-a", cycleId: string | null = CYCLE) => ({
  actorUid,
  nowIso: `2026-11-05T16:${String(minute).padStart(2, "0")}:00.000Z`,
  eventId: op(900 + minute),
  cycleId,
});

function animal(overrides: Partial<PacketAnimalInput> = {}): PacketAnimalInput {
  return {
    animalId: ANIMAL,
    name: "Example Pet 1",
    species: "Dog",
    breed: "Mixed",
    weight: 30,
    weightUnit: "lb",
    weightBasis: "current",
    maturity: "adult",
    fidoScore: 4,
    treatment: "pet",
    ...overrides,
  };
}

function save(
  current: PacketInputsRecord | null,
  body: Omit<SavePacketInputs, "leaseId" | "operationId">,
  at: ReturnType<typeof meta>,
  leaseId = "701",
) {
  return planPacketInputsSave(current, { leaseId, operationId: op(1), ...body }, at);
}

function refusal(run: () => unknown): EditableLayerError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EditableLayerError);
    return error as EditableLayerError;
  }
  throw new Error("The save was accepted.");
}

describe("S253 R-S253-3: the deposit staff record for a pet", () => {
  it("is absent until staff record one: no input has a deposit by default", () => {
    const { record } = save(
      null,
      { animals: { expectedRevision: 0, entries: [animal()] } },
      meta(0),
    );
    expect(record.animals.entries[0]).not.toHaveProperty("deposit");
  });

  it("keeps the amount with where it came from, who recorded it and when", () => {
    const { record, changed } = save(
      null,
      {
        animals: {
          expectedRevision: 0,
          entries: [
            animal({
              deposit: { amountCents: 30_000, source: "SYNTHETIC screening result" },
            }),
          ],
        },
      },
      meta(1),
    );
    expect(changed).toEqual(["animals"]);
    expect(record.animals.entries[0].deposit).toEqual({
      amountCents: 30_000,
      source: "SYNTHETIC screening result",
      recordedAt: "2026-11-05T16:01:00.000Z",
      recordedByUid: "editor-a",
    });
  });

  it("lets the server say who recorded it: a sent author or time is never kept", () => {
    const { record } = save(
      null,
      {
        animals: {
          expectedRevision: 0,
          entries: [
            animal({
              deposit: {
                amountCents: 30_000,
                source: "SYNTHETIC screening result",
                recordedAt: "2020-01-01T00:00:00.000Z",
                recordedByUid: "someone-else",
              },
            }),
          ],
        },
      },
      meta(2),
    );
    expect(record.animals.entries[0].deposit).toMatchObject({
      recordedAt: "2026-11-05T16:02:00.000Z",
      recordedByUid: "editor-a",
    });
  });

  it("keeps the first record when another person saves the same deposit, and restamps a changed one", () => {
    const entered = { amountCents: 30_000, source: "SYNTHETIC screening result" };
    const first = save(
      null,
      { animals: { expectedRevision: 0, entries: [animal({ deposit: entered })] } },
      meta(3),
    ).record;
    const renamed = save(
      first,
      {
        animals: {
          expectedRevision: 1,
          entries: [animal({ name: "Example Pet One", deposit: entered })],
        },
      },
      meta(4, "editor-b"),
    ).record;
    expect(renamed.animals.entries[0].deposit).toEqual(first.animals.entries[0].deposit);
    const changed = save(
      renamed,
      {
        animals: {
          expectedRevision: 2,
          entries: [
            animal({
              name: "Example Pet One",
              deposit: { ...entered, amountCents: 30_001 },
            }),
          ],
        },
      },
      meta(5, "editor-b"),
    ).record;
    expect(changed.animals.entries[0].deposit).toEqual({
      amountCents: 30_001,
      source: "SYNTHETIC screening result",
      recordedAt: "2026-11-05T16:05:00.000Z",
      recordedByUid: "editor-b",
    });
  });

  it("needs a source, and refuses a negative or fractional amount", () => {
    const deposit = (value: unknown) =>
      PacketAnimalInputSchema.safeParse({ ...animal(), deposit: value }).success;
    expect(deposit({ amountCents: 30_000, source: "SYNTHETIC screening result" })).toBe(
      true,
    );
    expect(deposit({ amountCents: 30_000 })).toBe(false);
    expect(deposit({ amountCents: 30_000, source: "  " })).toBe(false);
    expect(deposit({ amountCents: -1, source: "SYNTHETIC screening result" })).toBe(
      false,
    );
    expect(deposit({ amountCents: 10.5, source: "SYNTHETIC screening result" })).toBe(
      false,
    );
    expect(deposit({ source: "SYNTHETIC screening result" })).toBe(false);
  });

  it("removes the deposit when staff clear it: nothing stands in for it", () => {
    const first = save(
      null,
      {
        animals: {
          expectedRevision: 0,
          entries: [
            animal({
              deposit: { amountCents: 30_000, source: "SYNTHETIC screening result" },
            }),
          ],
        },
      },
      meta(6),
    ).record;
    const cleared = save(
      first,
      { animals: { expectedRevision: 1, entries: [animal()] } },
      meta(7),
    ).record;
    expect(cleared.animals.entries[0]).not.toHaveProperty("deposit");
  });
});

describe("S253 R-S253-7: the owner explanation is saved as staff typed it", () => {
  const TEXT = "SYNTHETIC first paragraph.\n\nSYNTHETIC second paragraph.";

  it("saves the text for the lease's current cycle with who wrote it and when", () => {
    const { record, changed } = save(
      null,
      { ownerExplanation: { expectedRevision: 0, text: TEXT } },
      meta(10),
    );
    expect(changed).toEqual(["ownerExplanation"]);
    expect(record.ownerExplanation).toEqual({
      revision: 1,
      text: TEXT,
      cycleId: CYCLE,
      recordedAt: "2026-11-05T16:10:00.000Z",
      recordedByUid: "editor-a",
    });
    expect(PacketInputsRecordSchema.safeParse(record).success).toBe(true);
  });

  it("keeps the paragraphs and changes only how line ends and stray spaces are stored", () => {
    const typed =
      "  SYNTHETIC first   paragraph. \r\n\r\n\r\n\r\nSYNTHETIC second\tparagraph.\r\nIts second line.  \n\n";
    const { record } = save(
      null,
      { ownerExplanation: { expectedRevision: 0, text: typed } },
      meta(11),
    );
    expect(record.ownerExplanation!.text).toBe(
      "SYNTHETIC first paragraph.\n\nSYNTHETIC second paragraph.\nIts second line.",
    );
  });

  it("refuses a stale edit with the current text kept", () => {
    const first = save(
      null,
      { ownerExplanation: { expectedRevision: 0, text: TEXT } },
      meta(12),
    ).record;
    const error = refusal(() =>
      save(
        first,
        { ownerExplanation: { expectedRevision: 0, text: "SYNTHETIC other text." } },
        meta(13, "editor-b"),
      ),
    );
    expect(error.status).toBe(409);
    expect(error.message).toMatch(/Another operator changed the owner explanation/);
    expect(first.ownerExplanation!.text).toBe(TEXT);
  });

  it("refuses a text the record cannot keep, with how much it is over", () => {
    const long = "SYNTHETIC ".repeat(OWNER_EXPLANATION_MAX_LENGTH / 10 + 1);
    const error = refusal(() =>
      save(null, { ownerExplanation: { expectedRevision: 0, text: long } }, meta(14)),
    );
    expect(error.status).toBe(400);
    expect(error.message).toBe(
      `The explanation is ${long.trim().length - OWNER_EXPLANATION_MAX_LENGTH} characters longer than the ${OWNER_EXPLANATION_MAX_LENGTH} this record keeps. Shorten it and save again.`,
    );
    const control = refusal(() =>
      save(
        null,
        { ownerExplanation: { expectedRevision: 0, text: "SYNTHETIC\u0007text" } },
        meta(15),
      ),
    );
    expect(control.status).toBe(400);
  });

  it("clears on request and never refills: a cleared explanation is no explanation", () => {
    const first = save(
      null,
      { ownerExplanation: { expectedRevision: 0, text: TEXT } },
      meta(16),
    ).record;
    const { record, changed } = save(
      first,
      { ownerExplanation: { expectedRevision: 1, text: null } },
      meta(17),
    );
    expect(changed).toEqual(["ownerExplanation"]);
    expect(record.ownerExplanation).toMatchObject({ revision: 2, text: null });
    expect(packetOwnerExplanationFact(record, CYCLE)).toBeNull();
    // Saving nothing over nothing changes nothing.
    expect(
      save(null, { ownerExplanation: { expectedRevision: 0, text: "   " } }, meta(18))
        .changed,
    ).toEqual([]);
  });

  it("changes nothing when the same text is saved again for the same cycle", () => {
    const first = save(
      null,
      { ownerExplanation: { expectedRevision: 0, text: TEXT } },
      meta(19),
    ).record;
    const again = save(
      first,
      { ownerExplanation: { expectedRevision: 1, text: `${TEXT}\n` } },
      meta(20, "editor-b"),
    );
    expect(again.changed).toEqual([]);
    expect(again.record).toBe(first);
  });

  it("is the form's fact only for the cycle it was written for", () => {
    const { record } = save(
      null,
      { ownerExplanation: { expectedRevision: 0, text: TEXT } },
      meta(21),
    );
    expect(packetOwnerExplanationFact(record, CYCLE)).toEqual({
      fieldKey: OWNER_EXPLANATION_FACT,
      normalizedValue: TEXT,
      displayValue: TEXT,
      source: {
        system: "renewal_staff_entry",
        reference: "packet-inputs:701:owner-explanation",
        retrievedAt: "2026-11-05T16:21:00.000Z",
        version: "1",
      },
      confidence: "Verified",
      applicability: "Applicable",
      verifiedBy: "editor-a",
      blockingScope: "owner_acknowledgment",
    });
    expect(
      packetOwnerExplanationFact(record, "c0000000-0000-4000-8000-000000000002"),
    ).toBeNull();
    expect(packetOwnerExplanationFact(record, null)).toBeNull();
    expect(packetOwnerExplanationFact(null, CYCLE)).toBeNull();
    // Written again for a later cycle, it is recorded for that cycle.
    const later = save(
      record,
      { ownerExplanation: { expectedRevision: 1, text: TEXT } },
      meta(22, "editor-a", "c0000000-0000-4000-8000-000000000002"),
    );
    expect(later.changed).toEqual(["ownerExplanation"]);
    expect(later.record.ownerExplanation).toMatchObject({
      revision: 2,
      cycleId: "c0000000-0000-4000-8000-000000000002",
    });
  });
});

describe("S253 R-S253-12: a save belongs to one lease", () => {
  it("refuses a save that names another lease's record", () => {
    const first = save(
      null,
      { ownerExplanation: { expectedRevision: 0, text: "SYNTHETIC text for 701." } },
      meta(30),
    ).record;
    const error = refusal(() =>
      save(
        first,
        { ownerExplanation: { expectedRevision: 1, text: "SYNTHETIC text." } },
        meta(31),
        "702",
      ),
    );
    expect(error.status).toBe(409);
    expect(error.message).toBe("These inputs belong to a different lease.");
  });

  it("has no input that carries a value to another lease, a portfolio or the policy", () => {
    // A save names exactly one lease and its own sections; nothing in it addresses anything wider.
    expect(
      SavePacketInputsSchema.safeParse({
        leaseId: "701",
        operationId: op(2),
        ownerExplanation: { expectedRevision: 0, text: "SYNTHETIC text." },
        applyToLeases: ["702"],
      }).success,
    ).toBe(false);
    for (const extra of [
      { useAsDefault: true },
      { portfolioId: "p-1" },
      { copyFromLeaseId: "702" },
    ])
      expect(
        SavePacketInputsSchema.safeParse({
          leaseId: "701",
          operationId: op(3),
          ownerExplanation: { expectedRevision: 0, text: "SYNTHETIC text.", ...extra },
        }).success,
      ).toBe(false);
  });
});
