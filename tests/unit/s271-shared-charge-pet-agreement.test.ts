import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mapHashOf, validateFieldMap } from "@/lib/lease-documents/artifact-intake";
import {
  ArtifactFieldMapSchema,
  ArtifactIntakeEntrySchema,
} from "@/lib/lease-documents/artifact-intake-contract";
import { fieldMapOpenQuestionIssues } from "@/lib/lease-documents/form-open-questions";
import { validateStaticGeometry } from "@/lib/lease-documents/static-pdf";
import {
  buildOnePathForms,
  onePathIntakeEntry,
} from "@/tests/browser/one-path-forms-seed.mjs";
import { SEEDED_AT } from "@/tests/fixtures/s253-one-path";

// S271 N10-04 and N10-10 (S264 R-S264-6 with S268): the rehearsal needs one reviewed form that
// relies on a shared offer charge so the accepted offer's packet parity has something to compare.
// The S253 seed's opt-in pet agreement keeps the same original file and reviews one more field,
// each animal's monthly charge. It must be a map the Admin review would accept, and the default
// seed must stay exactly as it was.

// The synthetic PDFs carry their creation time, so both builds read one pinned clock.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

describe("S271: the opt-in pet agreement that reads a shared charge", () => {
  it("keeps the same original and adds one reviewed per-animal monthly charge field", async () => {
    const plain = await buildOnePathForms();
    const shared = await buildOnePathForms({ sharedChargePetAgreement: true });
    const form = shared.animal_agreement;
    expect(form.contentHash).toBe(plain.animal_agreement.contentHash);
    expect(form.reference).toBe(plain.animal_agreement.reference);
    const map = ArtifactFieldMapSchema.parse(form.fieldMap);
    expect(map.mapVersion).toBe("one-path-pet-shared-charge-v1");
    expect(form.mapHash).toBe(mapHashOf(map));
    expect(await validateStaticGeometry(form.bytes, map.static!)).toEqual([]);
    expect(fieldMapOpenQuestionIssues(map)).toEqual([]);
    const entry = ArtifactIntakeEntrySchema.parse({
      ...onePathIntakeEntry(form, SEEDED_AT),
      id: form.kind,
    });
    expect(validateFieldMap(map, entry, null)).toEqual({ ok: true, issues: [] });
    expect(
      map.fields.filter((field) => field.factKey === "animal.monthly_charge"),
    ).toEqual([
      expect.objectContaining({
        fieldId: "AnimalMonthly",
        multiplicity: "per_animal",
        required: false,
      }),
    ]);
    expect(
      map.static!.regions.filter((region) => region.fieldId === "AnimalMonthly"),
    ).toHaveLength(4);
  });

  it("leaves the default seed and the other forms unchanged", async () => {
    const plain = await buildOnePathForms();
    const shared = await buildOnePathForms({ sharedChargePetAgreement: true });
    const map = ArtifactFieldMapSchema.parse(plain.animal_agreement.fieldMap);
    expect(map.mapVersion).toBe("one-path-pet-v1");
    expect(map.fields.some((field) => field.factKey === "animal.monthly_charge")).toBe(
      false,
    );
    for (const kind of [
      "owner_acknowledgment",
      "brokerage_disclosure",
      "renewal_extension",
    ] as const)
      expect(shared[kind].mapHash).toBe(plain[kind].mapHash);
  });
});
