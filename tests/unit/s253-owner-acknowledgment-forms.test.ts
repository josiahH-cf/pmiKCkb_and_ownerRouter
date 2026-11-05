import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DERIVED_ARTIFACT_COLLECTIONS,
  prepareDerivedArtifact,
  readDerivedArtifactContent,
  readDerivedArtifactStatus,
} from "@/lib/firestore/lease-derived-artifacts";
import {
  ArtifactFieldMapSchema,
  type ArtifactFieldMap,
} from "@/lib/lease-documents/artifact-intake-contract";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import {
  AGENCY_SELECTIONS_NOTE,
  EXECUTION_DATE_NOTE,
  ORGANIZATION_DIFFERENCE_NOTE,
  organizationDifferenceNote,
} from "@/lib/lease-documents/form-notes";
import {
  OWNER_ACKNOWLEDGMENT_SEPARATE_LABEL,
  projectLeasePacketReadiness,
} from "@/lib/lease-documents/lease-packet-readiness";
import {
  buildOwnerAcknowledgmentInput,
  ownerAcknowledgmentTransactionId,
  packetFilesPreparable,
} from "@/lib/lease-documents/owner-acknowledgment";
import {
  OWNER_EXPLANATION_FACT,
  OWNER_EXPLANATION_NEED,
  OWNER_EXPLANATION_TERMS_CHANGED,
  SHIPPED_OWNER_EXPLANATION_STARTING_TEXT,
  ownerExplanationState,
} from "@/lib/lease-documents/owner-explanation";
import {
  readStaticPageRuns,
  readStaticPdfLines,
  readStaticPdfValues,
} from "@/lib/lease-documents/static-pdf";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import {
  ONE_PATH_EXECUTION_DATE_AREA,
  ONE_PATH_ORGANIZATIONS,
} from "@/tests/browser/one-path-forms-seed.mjs";
import { admin } from "@/tests/fixtures/s130-derived";
import {
  CYCLE,
  STAFF_AT,
  feeAlonePolicy,
  onePathCatalog,
  onePathEvaluationInputs,
  onePathView,
  setupOnePathLease,
} from "@/tests/fixtures/s253-one-path";

// S253 BEH-S253-3, BEH-S253-4, BEH-S253-5, AC-S253-3, AC-S253-4, AC-S253-5 through the real
// pipeline on the rehearsal seed's synthetic owner acknowledgment and brochure. Invented text only.

beforeEach(() => {
  vi.stubEnv("ENVIRONMENT_KIND", "demo");
  vi.stubEnv("DATA_CONTEXT", "demo");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

type Lease = Awaited<ReturnType<typeof setupOnePathLease>>;
type Form = Parameters<Lease["request"]>[0];
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function prepared(t: Lease, kind: Form) {
  const record = await prepareDerivedArtifact(
    admin,
    t.prepareRequest(kind),
    t.db,
    t.deps,
  );
  const { content } = await readDerivedArtifactContent(
    admin,
    { ...t.request(kind), derivedId: record.id },
    t.db,
    t.deps,
  );
  const map = ArtifactFieldMapSchema.parse(t.artifactOf(kind).fillMapping!.map);
  return {
    record,
    content,
    map,
    values: await readStaticPdfValues(content, map.static!),
    lines: (await readStaticPdfLines(content)).map((line) => line.text),
  };
}

const kept = (t: Lease) =>
  [...t.fake.store.keys()].filter(
    (path) =>
      path.startsWith(`${DERIVED_ARTIFACT_COLLECTIONS.records}/`) ||
      path.startsWith("publication_content_chunks/"),
  );

const touching = (run: Rect, area: Rect) =>
  run.x < area.x + area.width &&
  area.x < run.x + run.width &&
  run.y < area.y + area.height &&
  area.y < run.y + run.height;

const FIRST = "SYNTHETIC first paragraph for the owner about this renewal.";
const SECOND = "SYNTHETIC second paragraph with one more sentence.";
const TWO_PARAGRAPHS = `${FIRST}\n\n${SECOND}`;
const EXPLANATION_HOLD = {
  artifactKind: "owner_acknowledgment",
  factKey: OWNER_EXPLANATION_FACT,
  label: OWNER_EXPLANATION_NEED,
};

describe("S253 BEH-S253-3: this lease's explanation in the owner acknowledgment's box", () => {
  it("prints two paragraphs as two paragraphs inside the box", async () => {
    const t = await setupOnePathLease({ explanation: TWO_PARAGRAPHS });
    // The acknowledgment is its own packet. The proof of the signed tenant packet is the only
    // thing it lacks, so its file can be prepared and inspected; nothing is sent.
    const owner = t.contexts.owner.snapshot;
    expect(owner).toMatchObject({
      transactionId: ownerAcknowledgmentTransactionId("701"),
      packetContext: "owner_acknowledgment",
      state: "Needs input",
    });
    expect(owner.blockers.map((blocker) => blocker.code)).toEqual([
      "owner_ack_proof_unavailable",
    ]);
    expect(packetFilesPreparable(owner)).toBe(true);
    const { values, content, map } = await prepared(t, "owner_acknowledgment");
    expect(values).toEqual({
      Property: "801 Example Street, Sample City",
      "OwnerName-1": "Sample Owner 1",
      "OwnerName-2": "",
      Explanation: TWO_PARAGRAPHS,
    });
    const index = map.static!.regions.findIndex((r) => r.regionId === "Explanation");
    const box = map.static!.regions[index].rect;
    const runs = (await readStaticPageRuns(content, 0)).filter(
      (run) => run.fillRegion === index,
    );
    expect(runs.map((run) => run.text.trim())).toEqual([FIRST, SECOND]);
    for (const run of runs) {
      expect(run.x).toBeGreaterThanOrEqual(box.x - 0.75);
      expect(run.x + run.width).toBeLessThanOrEqual(box.x + box.width + 0.75);
      expect(run.y).toBeGreaterThanOrEqual(box.y - 0.75);
      expect(run.y + run.height).toBeLessThanOrEqual(box.y + box.height + 0.75);
    }
    // An empty line stands between the paragraphs: the second starts two line steps lower.
    expect(runs[0].y - runs[1].y).toBeCloseTo(2 * 1.2 * 10, 3);
  });

  it("shows the saved text in the exact box before anything is prepared", async () => {
    const t = await setupOnePathLease({ explanation: TWO_PARAGRAPHS });
    const explanation = onePathView(t).ownerExplanation!;
    expect(explanation).toMatchObject({
      text: TWO_PARAGRAPHS,
      need: null,
      recordedAt: STAFF_AT,
      recordedByUid: "synthetic-editor",
      termsChangedAfter: false,
      transactionId: ownerAcknowledgmentTransactionId("701"),
      formNotes: [EXECUTION_DATE_NOTE],
    });
    expect(explanation.preview).toEqual({
      lines: [FIRST, "", SECOND],
      capacity: 17,
      issue: null,
    });
    expect(kept(t)).toEqual([]);
  });

  it("refuses a text too long for the box with how much it is over, and keeps nothing", async () => {
    const long = Array.from(
      { length: 30 },
      (_, index) => `SYNTHETIC line ${index + 1} for the owner.`,
    ).join("\n");
    const t = await setupOnePathLease({ explanation: long });
    // The lease says so before anyone prepares a file, in the same words the filler refuses with.
    const preview = onePathView(t).ownerExplanation!.preview!;
    expect(preview.issue).toMatch(
      /^The text is 13 lines longer than its box holds, about \d+ characters\. The reviewed text size is kept and nothing is cut/,
    );
    await expect(
      prepareDerivedArtifact(
        admin,
        t.prepareRequest("owner_acknowledgment"),
        t.db,
        t.deps,
      ),
    ).rejects.toThrow(
      /Explanation: the text is 13 lines longer than its box holds, about \d+ characters\. The reviewed text size is kept and nothing is cut/,
    );
    expect(kept(t)).toEqual([]);
  });

  it("with none recorded only the owner acknowledgment waits", async () => {
    const t = await setupOnePathLease({ animals: "one_pet", deposits: [30_000] });
    const owner = t.contexts.owner.snapshot;
    expect(owner.manifest!.formHolds).toEqual([EXPLANATION_HOLD]);
    expect(owner.blockers.map((blocker) => blocker.code)).toEqual([
      "owner_ack_proof_unavailable",
    ]);
    expect(onePathView(t).ownerExplanation).toMatchObject({
      text: null,
      need: "Needs the explanation for this lease",
      preview: { lines: [], capacity: 17, issue: null },
    });
    await expect(
      prepareDerivedArtifact(
        admin,
        t.prepareRequest("owner_acknowledgment"),
        t.db,
        t.deps,
      ),
    ).rejects.toThrow(
      "Approved owner acknowledgment waits: Needs the explanation for this lease. The lease's other forms can be prepared.",
    );
    expect(
      await readDerivedArtifactStatus(
        admin,
        t.request("owner_acknowledgment"),
        t.db,
        t.deps,
      ),
    ).toEqual({
      supported: true,
      record: null,
      holds: [OWNER_EXPLANATION_NEED],
      notes: [EXECUTION_DATE_NOTE],
      printed: [`Page 1, Organization: ${ONE_PATH_ORGANIZATIONS.owner_acknowledgment}`],
    });
    // The tenant packet waits on nothing and its forms are prepared as usual.
    expect(t.contexts.tenant.snapshot).toMatchObject({
      state: "Ready for preview",
      blockers: [],
    });
    expect(t.contexts.tenant.snapshot.manifest!.formHolds).toBeUndefined();
    expect((await prepared(t, "animal_agreement")).values.Total).toBe("$350.00");
    expect((await prepared(t, "renewal_extension")).record.comparison.verified).toBe(
      true,
    );
  });

  it("writing or changing the explanation changes the owner packet only", async () => {
    const { catalog } = await onePathCatalog();
    const hashes = (explanation?: string) => {
      const built = onePathEvaluationInputs(catalog, { animals: "one_pet", explanation });
      return {
        tenant: evaluateRenewalPacket(built.tenant).payloadHash,
        owner: evaluateRenewalPacket(built.owner).payloadHash,
      };
    };
    const none = hashes();
    const written = hashes(TWO_PARAGRAPHS);
    const changed = hashes(`${TWO_PARAGRAPHS}\n\nSYNTHETIC third paragraph.`);
    expect(new Set([none.tenant, written.tenant, changed.tenant]).size).toBe(1);
    expect(new Set([none.owner, written.owner, changed.owner]).size).toBe(3);
  });

  it("the application writes none of it: every drawn value is one staff recorded on this lease", async () => {
    expect(SHIPPED_OWNER_EXPLANATION_STARTING_TEXT).toBe("");
    const t = await setupOnePathLease({ explanation: TWO_PARAGRAPHS });
    expect(onePathView(t).ownerExplanation!.startingText).toBe("");
    const { values, lines } = await prepared(t, "owner_acknowledgment");
    const original = (await readStaticPdfLines(t.forms.owner_acknowledgment.bytes)).map(
      (line) => line.text,
    );
    // Beyond the form's own printed lines, the file reads exactly the three recorded values.
    const added = lines.filter((line) => !original.includes(line));
    expect(added.sort()).toEqual(
      [
        `Property: ${values.Property}`,
        `Owner: ${values["OwnerName-1"]}`,
        FIRST,
        SECOND,
      ].sort(),
    );
  });

  it("flags the explanation when a renewal term changes after it was written, and keeps it", async () => {
    const t = await setupOnePathLease({ explanation: TWO_PARAGRAPHS });
    const working = (recordedAt: string) =>
      ({
        leaseId: "701",
        revision: 2,
        fields: { terms_rent: { value: 1_500, recordedAt } },
      }) as unknown as RenewalWorkingRecord;
    const before = onePathView(t, { working: working("2026-11-05T15:30:00.000Z") });
    expect(before.ownerExplanation).toMatchObject({ termsChangedAfter: false });
    const after = onePathView(t, { working: working("2026-11-05T17:00:00.000Z") });
    expect(after.ownerExplanation).toMatchObject({
      termsChangedAfter: true,
      text: TWO_PARAGRAPHS,
      need: null,
    });
    expect(OWNER_EXPLANATION_TERMS_CHANGED).toBe("Terms changed after this was written");
    // Flagged, never cleared: the form still carries the text staff wrote.
    expect(t.owner.facts.map((fact) => fact.fieldKey)).toContain(OWNER_EXPLANATION_FACT);
  });

  it("an explanation written for an earlier cycle is kept on the record and applies to no later one", async () => {
    const { catalog } = await onePathCatalog();
    const built = onePathEvaluationInputs(catalog, { explanation: TWO_PARAGRAPHS });
    const laterCycle = "c0000000-0000-4000-8000-000000000999";
    expect(
      ownerExplanationState({
        stored: built.inputs.ownerExplanation,
        cycleId: laterCycle,
        termsChangedAt: null,
      }),
    ).toMatchObject({ text: null, fromEarlierCycle: true, need: OWNER_EXPLANATION_NEED });
    const later = buildOwnerAcknowledgmentInput({
      tenant: built.tenant,
      inputs: built.inputs,
      cycleId: laterCycle,
      calculated: built.assembled.calculated,
    });
    expect(later.facts.map((fact) => fact.fieldKey)).not.toContain(
      OWNER_EXPLANATION_FACT,
    );
    expect(later.formHolds).toEqual([EXPLANATION_HOLD]);
    expect(built.inputs.ownerExplanation).toMatchObject({
      text: TWO_PARAGRAPHS,
      cycleId: CYCLE,
    });
  });
});

describe("S253 BEH-S253-4: Lease executed on has no default", () => {
  const spellings = (iso: string) => {
    const [year, month, day] = iso.split("-");
    const long = new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    return [
      iso,
      `${month}/${day}/${year}`,
      `${Number(month)}/${Number(day)}/${year}`,
      long,
    ];
  };

  it.each([
    ["2025-12-01", "2026-11-20", "2026-11-05T16:00:00.000Z"],
    ["2026-01-15", "2026-12-31", "2026-12-15T09:30:00.000Z"],
    ["2024-02-29", "2027-01-04", "2027-01-02T23:59:00.000Z"],
  ])(
    "stays blank with lease start %s, return by %s and today %s",
    async (leaseStart, returnBy, today) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(today));
      const t = await setupOnePathLease({
        explanation: TWO_PARAGRAPHS,
        facts: {
          "lease.current_start_date": leaseStart,
          "lease.original_date": leaseStart,
          "renewal.return_by_date": returnBy,
        },
      });
      t.deps.now = () => today;
      const { content, values, lines, record } = await prepared(
        t,
        "owner_acknowledgment",
      );
      expect(record.preparedAt).toBe(today);
      // Nothing is drawn in the execution-date area, and nothing was there to begin with.
      const runs = await readStaticPageRuns(content, 0);
      expect(
        runs.filter((run) => touching(run, ONE_PATH_EXECUTION_DATE_AREA.rect)),
      ).toEqual([]);
      // The reviewed regions are the only places a value can stand, and none is a date.
      expect(Object.keys(values)).toEqual([
        "Property",
        "OwnerName-1",
        "OwnerName-2",
        "Explanation",
      ]);
      const text = lines.join("\n");
      expect(text).toContain("Lease executed on:");
      for (const date of [leaseStart, returnBy, today.slice(0, 10)])
        for (const spelled of spellings(date)) expect(text).not.toContain(spelled);
    },
  );

  it("says so in the form's notes wherever the form is shown", async () => {
    const t = await setupOnePathLease({ explanation: TWO_PARAGRAPHS });
    const status = await readDerivedArtifactStatus(
      admin,
      t.request("owner_acknowledgment"),
      t.db,
      t.deps,
    );
    expect(status).toMatchObject({
      supported: true,
      record: null,
      notes: [
        "Lease executed on is left blank until the business confirms which date belongs there",
      ],
    });
    const rows = projectLeasePacketReadiness({
      manifest: t.manifest,
      evaluation: evaluateRenewalPacket(t.tenant),
      familyUse: { readable: true, families: t.catalog.familyUse! },
    });
    expect(rows.find((row) => row.kind === "owner_acknowledgment")).toMatchObject({
      applicability: OWNER_ACKNOWLEDGMENT_SEPARATE_LABEL,
      notes: [EXECUTION_DATE_NOTE],
    });
  });

  it("refuses a map that would fill the date, whatever it is bound to", async () => {
    const dated = (map: ArtifactFieldMap): ArtifactFieldMap =>
      ArtifactFieldMapSchema.parse({
        ...map,
        mapVersion: "one-path-owner-dated",
        fields: [
          ...map.fields,
          {
            fieldId: "ExecutedOn",
            factKey: "lease.current_start_date",
            meaning: "SYNTHETIC lease executed on date",
            required: false,
            multiplicity: "single",
            allowedSourceSystems: ["renewal_staff_entry"],
          },
        ],
        static: {
          ...map.static!,
          regions: [
            ...map.static!.regions,
            {
              regionId: "ExecutedOn",
              fieldId: "ExecutedOn",
              slot: 0,
              pageIndex: 0,
              rect: { ...ONE_PATH_EXECUTION_DATE_AREA.rect },
              format: "date_long",
              fontSize: 10,
              align: "left",
              existing: "blank",
            },
          ],
          protectedRegions: map.static!.protectedRegions.filter(
            (region) => region.kind !== "execution_date",
          ),
        },
      });
    const t = await setupOnePathLease({
      explanation: TWO_PARAGRAPHS,
      facts: { "lease.current_start_date": "2026-12-01" },
      remap: { owner_acknowledgment: dated },
    });
    await expect(
      prepareDerivedArtifact(
        admin,
        t.prepareRequest("owner_acknowledgment"),
        t.db,
        t.deps,
      ),
    ).rejects.toThrow(
      /Lease executed on is mapped to a value\. It stays blank until the business confirms which date belongs there\./,
    );
    expect(kept(t)).toEqual([]);
    expect(
      await readDerivedArtifactStatus(
        admin,
        t.request("owner_acknowledgment"),
        t.db,
        t.deps,
      ),
    ).toMatchObject({ supported: true, record: null, mapIssues: expect.any(Array) });
  });
});

describe("S253 BEH-S253-4: the brochure's four footer boxes are tenant initial boxes", () => {
  const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

  it("uses the approved brochure exactly as approved, so the four boxes are untouched", async () => {
    const t = await setupOnePathLease({ tenants: 4 });
    expect(
      await readDerivedArtifactStatus(
        admin,
        t.request("brokerage_disclosure"),
        t.db,
        t.deps,
      ),
    ).toEqual({
      supported: false,
      unchangedAttachment: true,
      reason:
        "Unchanged approved attachment: it has no variable values and is used exactly as approved.",
      record: null,
      notes: ["Tenant initials: four boxes", AGENCY_SELECTIONS_NOTE],
      printed: [`Page 1, Organization: ${ONE_PATH_ORGANIZATIONS.brokerage_disclosure}`],
      originalHref:
        "/api/lease-renewal/document-artifact?leaseId=701&documentRef=one-path-brokerage_disclosure",
    });
    // Preparing the packet's other forms leaves the brochure alone, and no filled copy of it can
    // be made: it has no reviewed place to draw anything.
    await prepared(t, "renewal_extension");
    await expect(
      prepareDerivedArtifact(
        admin,
        t.prepareRequest("brokerage_disclosure"),
        t.db,
        t.deps,
      ),
    ).rejects.toThrow(/exact approved field or region mapping/);
    const brochure = t.artifactOf("brokerage_disclosure");
    const bytes = t.forms.brokerage_disclosure.bytes;
    expect(brochure.contentHash).toBe(sha(bytes));
    expect(
      [...t.fake.store.values()].filter(
        (record) => record.artifactId === brochure.artifactId,
      ),
    ).toEqual([]);
    const map = ArtifactFieldMapSchema.parse(t.forms.brokerage_disclosure.fieldMap);
    const runs = await readStaticPageRuns(bytes, 0);
    expect(map.static!.protectedRegions).toHaveLength(4);
    for (const box of map.static!.protectedRegions)
      expect(runs.filter((run) => touching(run, box.rect))).toEqual([]);
  });

  it("asks how initials are collected on a five-tenant lease instead of guessing", async () => {
    const question = "More than four tenants: confirm how initials are collected";
    const five = await setupOnePathLease({ tenants: 5 });
    expect(evaluateRenewalPacket(five.tenant)).toMatchObject({
      state: "Ready for preview",
      blockers: [],
    });
    expect(
      await readDerivedArtifactStatus(
        admin,
        five.request("brokerage_disclosure"),
        five.db,
        five.deps,
      ),
    ).toMatchObject({
      notes: ["Tenant initials: four boxes", AGENCY_SELECTIONS_NOTE],
      questions: [question],
    });
    const row = (t: Lease) =>
      projectLeasePacketReadiness({
        manifest: t.manifest,
        evaluation: evaluateRenewalPacket(t.tenant),
        familyUse: { readable: true, families: t.catalog.familyUse! },
      }).find((entry) => entry.kind === "brokerage_disclosure")!;
    expect(row(five)).toMatchObject({
      applicability: "Applies to this lease",
      notes: ["Tenant initials: four boxes", AGENCY_SELECTIONS_NOTE],
      questions: [question],
    });
    const four = await setupOnePathLease({ tenants: 4 });
    expect(row(four).questions).toBeUndefined();
    expect(row(four).notes).toEqual([
      "Tenant initials: four boxes",
      AGENCY_SELECTIONS_NOTE,
    ]);
  });
});

describe("S253 BEH-S253-5: organization text stays per form; no value crosses leases", () => {
  it("each form still prints its own organization text after preparation", async () => {
    const t = await setupOnePathLease({
      animals: "one_pet",
      deposits: [30_000],
      explanation: TWO_PARAGRAPHS,
    });
    const owner = (await prepared(t, "owner_acknowledgment")).lines.join("\n");
    const pet = (await prepared(t, "animal_agreement")).lines.join("\n");
    const brochure = (await readStaticPdfLines(t.forms.brokerage_disclosure.bytes))
      .map((line) => line.text)
      .join("\n");
    const printedOn = {
      owner_acknowledgment: owner,
      animal_agreement: pet,
      brokerage_disclosure: brochure,
    };
    for (const [form, text] of Object.entries(printedOn))
      for (const [kind, name] of Object.entries(ONE_PATH_ORGANIZATIONS))
        expect(text.includes(name), `${name} on ${form}`).toBe(kind === form);
    // No fact of the lease carries an organization name, so none can travel to another form.
    const facts = JSON.stringify([t.tenant.facts, t.owner.facts]);
    for (const name of Object.values(ONE_PATH_ORGANIZATIONS))
      expect(facts).not.toContain(name);
  });

  it("shows the difference as information: nothing waits on it", async () => {
    const t = await setupOnePathLease({ explanation: TWO_PARAGRAPHS });
    const rows = projectLeasePacketReadiness({
      manifest: t.manifest,
      evaluation: evaluateRenewalPacket(t.tenant),
      familyUse: { readable: true, families: t.catalog.familyUse! },
    });
    const organizations = Object.fromEntries(
      rows
        .filter((row) => row.organizations?.length)
        .map((row) => [row.kind, row.organizations]),
    );
    expect(organizations).toEqual({
      owner_acknowledgment: [ONE_PATH_ORGANIZATIONS.owner_acknowledgment],
      brokerage_disclosure: [ONE_PATH_ORGANIZATIONS.brokerage_disclosure],
    });
    expect(organizationDifferenceNote(rows.map((row) => row.organizations))).toBe(
      ORGANIZATION_DIFFERENCE_NOTE,
    );
    expect(evaluateRenewalPacket(t.tenant).blockers).toEqual([]);
    for (const row of rows) expect(row.missing.join(" ")).not.toMatch(/organi[sz]ation/i);
    // One form alone, or forms that print the same text, show no note.
    expect(
      organizationDifferenceNote([["Example Sample Rentals"], undefined]),
    ).toBeNull();
    expect(
      organizationDifferenceNote([
        ["Example Sample Rentals"],
        ["Example Sample Rentals"],
      ]),
    ).toBeNull();
  });

  it("refuses a map that would change the organization text a form prints", async () => {
    const overprinted = (map: ArtifactFieldMap): ArtifactFieldMap =>
      ArtifactFieldMapSchema.parse({
        ...map,
        mapVersion: "one-path-owner-overprint",
        fields: [
          ...map.fields,
          {
            fieldId: "Overprint",
            factKey: "property.address",
            meaning: "SYNTHETIC second address line",
            required: false,
            multiplicity: "single",
            allowedSourceSystems: ["renewal_staff_entry"],
          },
        ],
        static: {
          ...map.static!,
          regions: [
            ...map.static!.regions,
            {
              regionId: "Overprint",
              fieldId: "Overprint",
              slot: 0,
              pageIndex: 0,
              rect: { x: 70, y: 701, width: 260, height: 17 },
              format: "text",
              fontSize: 10,
              align: "left",
              existing: "replace",
            },
          ],
        },
      });
    const t = await setupOnePathLease({
      explanation: TWO_PARAGRAPHS,
      remap: { owner_acknowledgment: overprinted },
    });
    await expect(
      prepareDerivedArtifact(
        admin,
        t.prepareRequest("owner_acknowledgment"),
        t.db,
        t.deps,
      ),
    ).rejects.toThrow(
      /Page 1: printed text this form carries would be changed by this map\. A change to printed organization, representative or signer text needs its form, page, exact replacement, signing role and who confirmed it\./,
    );
    expect(kept(t)).toEqual([]);
  });

  it("a value entered on one lease appears on no other lease, portfolio or policy", async () => {
    const { catalog } = await onePathCatalog();
    const marker = "SYNTHETIC explanation written only for lease 701.";
    const entered = onePathEvaluationInputs(catalog, {
      leaseId: "701",
      animals: "one_pet",
      deposits: [31_415],
      explanation: marker,
    });
    const other = onePathEvaluationInputs(catalog, {
      leaseId: "702",
      animals: "one_pet",
    });
    // Both leases belong to the same owner, and the company policy is the same record.
    const ownerOf = (built: typeof entered) =>
      built.inputs.people.entries.find(
        (person) => person.roles[0].signerRole === "owner",
      )!.fullName;
    expect(ownerOf(other)).toBe(ownerOf(entered));
    expect(entered.policy).toEqual(feeAlonePolicy());
    expect(other.policy).toEqual(feeAlonePolicy());
    expect(onePathView(entered).petAgreement).toMatchObject({
      depositCents: 31_415,
      totalCents: 36_415,
    });
    const view = onePathView(other);
    expect(view.petAgreement).toMatchObject({ depositCents: null, totalCents: null });
    expect(view.ownerExplanation).toMatchObject({
      text: null,
      startingText: "",
      need: OWNER_EXPLANATION_NEED,
    });
    const everything = JSON.stringify([
      other.inputs,
      other.tenant.facts,
      other.tenant.charges,
      other.tenant.animals,
      other.owner.facts,
      other.policy,
      view,
    ]);
    for (const value of [marker, "31415", "314.15", "364.15"])
      expect(everything).not.toContain(value);
    // The other lease waits exactly as a lease on which nothing was entered.
    expect(evaluateRenewalPacket(other.owner).manifest!.formHolds).toEqual([
      EXPLANATION_HOLD,
    ]);
    expect(
      evaluateRenewalPacket(other.tenant).manifest!.formHolds?.map((hold) => hold.label),
    ).toEqual([
      "Example Pet 1: record the refundable deposit and where it comes from.",
      "Example Pet 1: record the refundable deposit and where it comes from.",
    ]);
  });
});
