import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  RENEWAL_WORKING_RECORD_COLLECTIONS,
  getRenewalWorkingRecord,
  listRenewalWorkingActivity,
  listRenewalWorkingRecords,
  saveRenewalWorkingField,
} from "@/lib/firestore/renewal-working-record";
import { RENEWAL_WORKSPACE_COLLECTIONS } from "@/lib/firestore/renewal-workspace";
import { RENEWAL_WORK_STATUS_COLLECTIONS } from "@/lib/firestore/renewal-work-status";
import {
  completeWorkingTerms,
  workingCurrentRent,
  workingRenewalTerms,
} from "@/lib/lease-renewal/working-record";

// S157/S155/S156: the lease-bound working record saves one field at a time with server
// attribution, per-field revisions and immutable operation identity. It creates no cycle, staff
// activity or provider effect, and independent fields never conflict. Values are synthetic.

const projectId = "pmi-kc-kb-s157-working-record-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const secondEditor: AuthenticatedUser = {
  uid: "editor-2",
  email: "editor2@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const canary: AuthenticatedUser = {
  uid: "canary-editor",
  email: "canary-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const OP = (n: number) =>
  `0f1c8f6e-6d1c-4bd3-9d7a-0000000000${String(n).padStart(2, "0")}`;

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s157-working-record-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

async function countDocs(collection: string) {
  return (await db.collection(collection).get()).size;
}

describe("S157 lease-bound working record store", () => {
  it("BEH-S157-1/3/4: an Editor saves a working rent directly, with server attribution and no request, approval or narrative", async () => {
    const saved = await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "current_rent",
        value: 1850,
        expectedRevision: 0,
        operationId: OP(1),
      },
      db,
    );

    expect(saved.duplicate).toBe(false);
    expect(workingCurrentRent(saved.record)).toBe(1850);
    expect(saved.record.fields.current_rent).toMatchObject({
      value: 1850,
      revision: 1,
      eventId: OP(1),
      recordedByUid: editor.uid,
      recordedByLabel: editor.email,
      origin: "staff_entry",
    });
    expect(saved.record.fields.current_rent.context).toBeUndefined();
    expect(Date.parse(saved.record.fields.current_rent.recordedAt)).not.toBeNaN();

    const activity = await listRenewalWorkingActivity(editor, "701", db);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      field: "current_rent",
      previousValue: null,
      value: 1850,
      revision: 1,
      recordedByUid: editor.uid,
    });
  });

  it("BEH-S154-6/BEH-S155-8: saving working information manufactures no cycle, staff activity or status", async () => {
    await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "terms_rent",
        value: 1925,
        expectedRevision: 0,
        operationId: OP(1),
      },
      db,
    );

    for (const collection of [
      RENEWAL_WORKSPACE_COLLECTIONS.head,
      RENEWAL_WORKSPACE_COLLECTIONS.cycles,
      RENEWAL_WORKSPACE_COLLECTIONS.activity,
      RENEWAL_WORK_STATUS_COLLECTIONS.head,
      RENEWAL_WORK_STATUS_COLLECTIONS.activity,
    ]) {
      expect(await countDocs(collection)).toBe(0);
    }
    expect(await countDocs(RENEWAL_WORKING_RECORD_COLLECTIONS.head)).toBe(1);
    expect(await countDocs(RENEWAL_WORKING_RECORD_COLLECTIONS.activity)).toBe(1);
  });

  it("BEH-S155-2/BEH-S157-2: each field saves alone, and future terms never change the working current rent", async () => {
    await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "current_rent",
        value: 1850,
        expectedRevision: 0,
        operationId: OP(1),
      },
      db,
    );
    // An invalid date is that field's failure alone.
    await expect(
      saveRenewalWorkingField(
        editor,
        {
          leaseId: "701",
          field: "terms_effective_date",
          value: "2027-02-30",
          expectedRevision: 0,
          operationId: OP(2),
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 400 });
    const saved = await saveRenewalWorkingField(
      secondEditor,
      {
        leaseId: "701",
        field: "terms_rent",
        value: 1995,
        expectedRevision: 0,
        operationId: OP(3),
      },
      db,
    );

    expect(workingCurrentRent(saved.record)).toBe(1850);
    const terms = workingRenewalTerms(saved.record);
    expect(terms).toMatchObject({ rent: 1995, effectiveDate: null, endDate: null });
    // Incomplete terms stay saved; only an operation that needs all three treats them as missing.
    expect(completeWorkingTerms(terms)).toBeNull();
    expect(saved.record.fields.terms_effective_date).toBeUndefined();
  });

  it("BEH-S155-5: a lost response retried with the same operation returns the saved value without a second entry", async () => {
    const request = {
      leaseId: "701",
      field: "current_rent",
      value: 1850,
      expectedRevision: 0,
      operationId: OP(1),
    };
    const first = await saveRenewalWorkingField(editor, request, db);
    const retry = await saveRenewalWorkingField(editor, request, db);

    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(retry.record.fields.current_rent.revision).toBe(1);
    expect(await countDocs(RENEWAL_WORKING_RECORD_COLLECTIONS.activity)).toBe(1);

    // The same operation id carrying a different value is a changed request, never a silent rewrite.
    await expect(
      saveRenewalWorkingField(editor, { ...request, value: 1900 }, db),
    ).rejects.toMatchObject({ status: 409 });
    expect(workingCurrentRent(await getRenewalWorkingRecord(editor, "701", db))).toBe(
      1850,
    );
  });

  it("BEH-S155-5/6: an older edit cannot overwrite a newer one, and the other fields stay usable", async () => {
    await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "current_rent",
        value: 1850,
        expectedRevision: 0,
        operationId: OP(1),
      },
      db,
    );
    await saveRenewalWorkingField(
      secondEditor,
      {
        leaseId: "701",
        field: "current_rent",
        value: 1875,
        expectedRevision: 1,
        operationId: OP(2),
      },
      db,
    );

    // The first editor still holds revision 1: a real concurrent edit of the same field.
    await expect(
      saveRenewalWorkingField(
        editor,
        {
          leaseId: "701",
          field: "current_rent",
          value: 1800,
          expectedRevision: 1,
          operationId: OP(3),
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });

    // An unrelated field saved by that same editor with its own revision is unaffected.
    const other = await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "terms_end_date",
        value: "2027-12-31",
        expectedRevision: 0,
        operationId: OP(4),
      },
      db,
    );
    expect(workingCurrentRent(other.record)).toBe(1875);
    expect(other.record.fields.current_rent.recordedByUid).toBe(secondEditor.uid);
    expect(workingRenewalTerms(other.record).endDate).toBe("2027-12-31");
    expect(await countDocs(RENEWAL_WORKING_RECORD_COLLECTIONS.activity)).toBe(3);
  });

  it("BEH-S155-6: two concurrent saves of one field admit exactly one", async () => {
    const results = await Promise.allSettled(
      [1, 2].map((n) =>
        saveRenewalWorkingField(
          n === 1 ? editor : secondEditor,
          {
            leaseId: "701",
            field: "terms_rent",
            value: 1900 + n,
            expectedRevision: 0,
            operationId: OP(n),
          },
          db,
        ),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const record = await getRenewalWorkingRecord(editor, "701", db);
    expect(record?.fields.terms_rent.revision).toBe(1);
    expect(await countDocs(RENEWAL_WORKING_RECORD_COLLECTIONS.activity)).toBe(1);
  });

  it("BEH-S157-8/9: adopting a source value is an attributed app edit that names its source and claims no source change", async () => {
    await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "current_rent",
        value: 1850,
        expectedRevision: 0,
        operationId: OP(1),
        context: "Owner confirmed by phone",
      },
      db,
    );
    await expect(
      saveRenewalWorkingField(
        editor,
        {
          leaseId: "701",
          field: "current_rent",
          value: 1800,
          expectedRevision: 1,
          operationId: OP(2),
          origin: "adopted_source",
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 400 });

    const adopted = await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "current_rent",
        value: 1800,
        expectedRevision: 1,
        operationId: OP(3),
        origin: "adopted_source",
        sourceLabel: "RentVine",
      },
      db,
    );
    expect(adopted.record.fields.current_rent).toMatchObject({
      value: 1800,
      revision: 2,
      origin: "adopted_source",
      sourceLabel: "RentVine",
    });
    const activity = await listRenewalWorkingActivity(editor, "701", db);
    expect(activity.map((entry) => [entry.previousValue, entry.value])).toEqual([
      [null, 1850],
      [1850, 1800],
    ]);
    expect(activity[0].context).toBe("Owner confirmed by phone");
    // Only this store's two collections hold anything: no receipt, proposal or execution exists.
    const collections = (await db.listCollections()).map((ref) => ref.id).sort();
    expect(collections).toEqual(
      [
        RENEWAL_WORKING_RECORD_COLLECTIONS.activity,
        RENEWAL_WORKING_RECORD_COLLECTIONS.head,
      ].sort(),
    );
  });

  it("BEH-S157-5: a deliberately cleared value stays cleared with its history, and re-saving an unchanged value appends nothing", async () => {
    await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "current_rent",
        value: 1850,
        expectedRevision: 0,
        operationId: OP(1),
      },
      db,
    );
    const unchanged = await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "current_rent",
        value: 1850,
        expectedRevision: 1,
        operationId: OP(2),
      },
      db,
    );
    expect(unchanged.duplicate).toBe(true);
    expect(await countDocs(RENEWAL_WORKING_RECORD_COLLECTIONS.activity)).toBe(1);

    const cleared = await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "current_rent",
        value: null,
        expectedRevision: 1,
        operationId: OP(3),
      },
      db,
    );
    expect(workingCurrentRent(cleared.record)).toBeNull();
    expect(cleared.record.fields.current_rent.revision).toBe(2);
    await expect(
      saveRenewalWorkingField(
        editor,
        {
          leaseId: "702",
          field: "current_rent",
          value: null,
          expectedRevision: 0,
          operationId: OP(4),
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("BEH-S167-7/BEH-S157-1: verification accounts and unrecognized fields are refused before any write", async () => {
    await expect(
      saveRenewalWorkingField(
        canary,
        {
          leaseId: "701",
          field: "current_rent",
          value: 1850,
          expectedRevision: 0,
          operationId: OP(1),
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      saveRenewalWorkingField(
        editor,
        {
          leaseId: "701",
          field: "deposit_amount",
          value: 1850,
          expectedRevision: 0,
          operationId: OP(2),
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(await countDocs(RENEWAL_WORKING_RECORD_COLLECTIONS.head)).toBe(0);
  });

  it("BEH-S155-10: the bulk desk read returns every lease's confirmed working record", async () => {
    await saveRenewalWorkingField(
      editor,
      {
        leaseId: "701",
        field: "current_rent",
        value: 1850,
        expectedRevision: 0,
        operationId: OP(1),
      },
      db,
    );
    await saveRenewalWorkingField(
      secondEditor,
      {
        leaseId: "702",
        field: "sheet_row",
        value: { tabTitle: "Lease Renewal", rowNumber: 42 },
        expectedRevision: 0,
        operationId: OP(2),
      },
      db,
    );

    const all = await listRenewalWorkingRecords(secondEditor, db);
    expect([...all.keys()].sort()).toEqual(["701", "702"]);
    expect(workingCurrentRent(all.get("701"))).toBe(1850);
    expect(all.get("702")?.fields.sheet_row.value).toEqual({
      tabTitle: "Lease Renewal",
      rowNumber: 42,
    });
  });
});
