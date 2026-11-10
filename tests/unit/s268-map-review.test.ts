import { describe, expect, it } from "vitest";

import {
  emptyArtifactIntakeManifest,
  type ArtifactIntakeEntry,
  type ArtifactIntakeManifest,
} from "@/lib/lease-documents/artifact-intake-contract";
import {
  PacketMapReviewSchema,
  mapDecisionLine,
  projectPacketMapReview,
  type PacketMapReview,
} from "@/lib/lease-documents/packet-map-review";
import {
  fillStaticPdf,
  formatStaticValue,
  readStaticPdfValues,
  validateStaticGeometry,
} from "@/lib/lease-documents/static-pdf";
import { geometry, runs, staticOriginal } from "@/tests/fixtures/synthetic-static";

// S268 R-S268-2 / AC-S268-2: the first packet review records each unresolved field and signing
// decision by form, page, meaning, approved source, responsible role and exact expected answer,
// bound to the exact original and map it was made against. The review itself stays in the
// existing private proposal outside Git; these checks use invented decisions only. A synthetic
// packet keeps protected signature and initial areas untouched and refuses a wrong or overflowing
// value.

const ORIGINAL = "a".repeat(64);
const MAP_HASH = "b".repeat(64);
const REFERENCE = "publication:synthetic-owner-ack-v1";

function review(overrides: Partial<PacketMapReview> = {}): PacketMapReview {
  return PacketMapReviewSchema.parse({
    schemaVersion: "packet-map-review/v1",
    caseRef: "SYNTHETIC first review case",
    originals: [
      {
        family: "owner_acknowledgment",
        publication: REFERENCE,
        contentHash: ORIGINAL,
        mapVersion: "synthetic-owner-ack-map-v1",
        mapHash: MAP_HASH,
      },
      {
        family: "brokerage_disclosure",
        publication: "publication:synthetic-brochure-v1",
        contentHash: "c".repeat(64),
      },
    ],
    decisions: [
      {
        id: "executed-on-date",
        family: "owner_acknowledgment",
        kind: "field_meaning",
        form: "SYNTHETIC owner acknowledgment",
        page: 1,
        meaning: "Which date belongs in Lease executed on",
        approvedSource: "The document authority's written rule",
        responsibleRole: "Document authority",
        expectedAnswer: "One named date rule, or that the box stays blank",
        status: "pending",
      },
      {
        id: "initial-order",
        family: "brokerage_disclosure",
        kind: "signing",
        form: "SYNTHETIC brokerage brochure",
        page: 2,
        meaning: "Which tenant initials which footer box",
        approvedSource: "The renewal lead's signing instructions",
        responsibleRole: "Renewal lead",
        expectedAnswer: "Box order for up to four tenants and what happens past four",
        status: "decided",
        decision: {
          answer: "SYNTHETIC: tenants initial in signing order",
          decidedByRole: "Renewal lead",
          authorityRef: "SYNTHETIC private proposal entry",
          recordedAt: "2026-11-10T16:00:00.000Z",
        },
      },
    ],
    ...overrides,
  });
}

function entry(
  kind: ArtifactIntakeEntry["kind"],
  reference: string,
  contentHash: string,
  map?: { mapVersion: string; mapHash: string },
): ArtifactIntakeEntry {
  return {
    id: kind,
    kind,
    state: "approved",
    revision: 2,
    publication: { system: "s21_publication", reference, contentHash },
    ...(map
      ? {
          fieldMap: { mapVersion: map.mapVersion } as ArtifactIntakeEntry["fieldMap"],
          mapHash: map.mapHash,
        }
      : {}),
    updated_at: "2026-11-10T15:00:00.000Z",
  };
}

function manifest(
  ownerAck: ArtifactIntakeEntry | null,
  brochure: ArtifactIntakeEntry | null,
): ArtifactIntakeManifest {
  const empty = emptyArtifactIntakeManifest();
  return {
    ...empty,
    entries: {
      ...empty.entries,
      owner_acknowledgment: ownerAck,
      brokerage_disclosure: brochure,
    },
  };
}
const current = () =>
  manifest(
    entry("owner_acknowledgment", REFERENCE, ORIGINAL, {
      mapVersion: "synthetic-owner-ack-map-v1",
      mapHash: MAP_HASH,
    }),
    entry("brokerage_disclosure", "publication:synthetic-brochure-v1", "c".repeat(64)),
  );

describe("AC-S268-2: unresolved decisions recorded by form, page, meaning, source and role", () => {
  it("lists each pending decision with its exact expected answer and keeps it pending", () => {
    const families = projectPacketMapReview(review(), current());
    const ownerAck = families.find((family) => family.family === "owner_acknowledgment")!;
    expect(ownerAck).toMatchObject({ bound: true, reason: null, decided: [] });
    expect(ownerAck.pending.map((item) => item.id)).toEqual(["executed-on-date"]);
    expect(mapDecisionLine(ownerAck.pending[0])).toBe(
      "SYNTHETIC owner acknowledgment, page 1: Which date belongs in Lease executed on. Approved source: The document authority's written rule. Who answers: Document authority. Needs: One named date rule, or that the box stays blank.",
    );
    const brochure = families.find((family) => family.family === "brokerage_disclosure")!;
    expect(brochure).toMatchObject({ bound: true, pending: [] });
    expect(brochure.decided.map((item) => item.id)).toEqual(["initial-order"]);
  });

  it("refuses a decided item without its answer and authority, a pending item with one, and an unbound family", () => {
    const base = review();
    const [pending, decided] = base.decisions;
    for (const decisions of [
      [{ ...decided, decision: undefined }],
      [{ ...pending, decision: decided.decision }],
      [{ ...pending, responsibleRole: " " }],
      [{ ...pending, page: 0 }],
      [{ ...pending, family: "renewal_extension" as const }],
      [pending, { ...pending }],
    ])
      expect(PacketMapReviewSchema.safeParse({ ...base, decisions }).success).toBe(false);
  });

  it("holds every decision of a family whose original or map changed, and only that family", () => {
    const changedOriginal = projectPacketMapReview(
      review(),
      manifest(
        entry("owner_acknowledgment", REFERENCE, "d".repeat(64), {
          mapVersion: "synthetic-owner-ack-map-v1",
          mapHash: MAP_HASH,
        }),
        entry(
          "brokerage_disclosure",
          "publication:synthetic-brochure-v1",
          "c".repeat(64),
        ),
      ),
    );
    expect(
      changedOriginal.find((family) => family.family === "owner_acknowledgment"),
    ).toMatchObject({
      bound: false,
      reason: "The original changed since the review.",
    });
    expect(
      changedOriginal.find((family) => family.family === "brokerage_disclosure"),
    ).toMatchObject({ bound: true });

    const remapped = projectPacketMapReview(
      review(),
      manifest(
        entry("owner_acknowledgment", REFERENCE, ORIGINAL, {
          mapVersion: "synthetic-owner-ack-map-v2",
          mapHash: "e".repeat(64),
        }),
        entry(
          "brokerage_disclosure",
          "publication:synthetic-brochure-v2",
          "f".repeat(64),
        ),
      ),
    );
    const brochure = remapped.find((family) => family.family === "brokerage_disclosure")!;
    // A decision made against other bytes is not an answer for these.
    expect(brochure).toMatchObject({
      bound: false,
      reason: "The original changed since the review.",
      decided: [],
    });
    expect(brochure.pending.map((item) => item.id)).toEqual(["initial-order"]);
    expect(
      remapped.find((family) => family.family === "owner_acknowledgment"),
    ).toMatchObject({ bound: false, reason: "The map changed since the review." });
    expect(
      projectPacketMapReview(review(), manifest(null, null)).map(
        (family) => family.reason,
      ),
    ).toEqual([
      "This form has no current original.",
      "This form has no current original.",
    ]);
  });
});

describe("AC-S268-2: a synthetic packet keeps signing areas and refuses wrong values", () => {
  const VALUES = [
    { regionId: "TenantName", text: "Sam Example" },
    { regionId: "Rent", text: "$950.00" },
    { regionId: "Effective", text: "January 1, 2027" },
  ];
  const INITIAL = { x: 300, y: 84, width: 60, height: 30 };
  const SIGNATURE = { x: 70, y: 84, width: 210, height: 30 };

  it("fills only reviewed regions and leaves protected signature and initial areas untouched", async () => {
    const original = await staticOriginal();
    const map = await geometry(original, {
      protectedRegions: [
        { pageIndex: 0, rect: SIGNATURE, kind: "signature" },
        { pageIndex: 0, rect: INITIAL, kind: "initial", signerRole: "tenant" },
      ],
    });
    expect(await validateStaticGeometry(original, map)).toEqual([]);
    const filled = await fillStaticPdf(original, map, VALUES);
    expect(await readStaticPdfValues(filled.content, map)).toEqual({
      TenantName: "Sam Example",
      Rent: "$950.00",
      Effective: "January 1, 2027",
    });
    const inside =
      (rect: typeof INITIAL) =>
      (run: { x: number; y: number; width: number; height: number; text: string }) =>
        run.x < rect.x + rect.width &&
        rect.x < run.x + run.width &&
        run.y < rect.y + rect.height &&
        rect.y < run.y + run.height;
    const before = await runs(original);
    const after = await runs(filled.content);
    for (const rect of [SIGNATURE, INITIAL])
      expect(after.filter(inside(rect)).map((run) => run.text)).toEqual(
        before.filter(inside(rect)).map((run) => run.text),
      );
  });

  it("refuses an overflowing value and a value of the wrong kind, and a map for a different original", async () => {
    const original = await staticOriginal();
    const map = await geometry(original);
    await expect(
      fillStaticPdf(original, map, [
        {
          regionId: "TenantName",
          text: "SYNTHETIC tenant name far too long for the region it is reviewed for",
        },
        VALUES[1],
        VALUES[2],
      ]),
    ).rejects.toThrow(/would overflow its region/);
    await expect(
      fillStaticPdf(original, map, [
        { regionId: "TenantName", text: "Zoë ✓" },
        VALUES[1],
        VALUES[2],
      ]),
    ).rejects.toThrow(/characters the approved font cannot show/);
    // A value is formatted only in its reviewed unit; anything else is refused before filling.
    expect(() => formatStaticValue("money", "about 900", null)).toThrow(/reviewed unit/);
    expect(() => formatStaticValue("date_long", "next month", null)).toThrow(
      /calendar date/,
    );
    const rotated = await staticOriginal({ rotate: true });
    await expect(fillStaticPdf(rotated, map, VALUES)).rejects.toThrow(
      /size, crop or rotation differs/,
    );
  });
});
