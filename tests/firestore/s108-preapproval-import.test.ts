import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  getMaintenancePropertyPreapproval,
  importMaintenancePropertyPreapprovals,
  listMaintenancePropertyPreapprovalActivity,
  setMaintenancePropertyPreapproval,
} from "@/lib/firestore/maintenance-property-preapprovals";
import {
  planPreapprovalImport,
  type RentVinePropertyLimit,
} from "@/lib/maintenance/rentvine-preapproval-import";

// S108 amendment (B-MNT1): the RentVine maintenance-limit import records only the confirmed plan, in
// one transaction, through the same versioned and audited record as a manual preapproval.
// Values are synthetic.

const projectId = "pmi-kc-kb-s108-import-test";
const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const editor: AuthenticatedUser = { ...admin, uid: "editor-1", role: "Editor" };
const approver: AuthenticatedUser = { ...admin, uid: "approver-1", role: "Approver" };
const EFFECTIVE = "2026-10-01T00:00:00.000Z";
const NOTE = "Imported from the RentVine maintenance limit on 10/01/2026.";

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s108-import-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

function property(key: string, limit: string): RentVinePropertyLimit {
  return {
    propertyKey: key,
    label: `Sample property ${key}`,
    limitAmount: limit,
    maintenanceNotes: null,
    active: true,
  };
}

async function manual(key: string, amountCents: number) {
  return setMaintenancePropertyPreapproval(
    admin,
    { propertyKey: key, amountCents, effectiveFromIso: "2026-01-01T00:00:00.000Z" },
    db,
  );
}

describe("S108 RentVine preapproval import store (AC-S108-7)", () => {
  it("records additions and changed amounts as versioned, audited preapprovals", async () => {
    await manual("11", 20_000);
    await manual("12", 40_000);
    const plan = planPreapprovalImport(
      [property("10", "500.00"), property("11", "250.00"), property("12", "400.00")],
      [
        (await getMaintenancePropertyPreapproval(admin, "11", db))!,
        (await getMaintenancePropertyPreapproval(admin, "12", db))!,
      ],
    );

    const records = await importMaintenancePropertyPreapprovals(
      admin,
      { rows: plan.rows, effectiveFromIso: EFFECTIVE, note: NOTE },
      db,
    );

    expect(
      records.map((record) => [record.property_key, record.amount_cents, record.version]),
    ).toEqual([
      ["10", 50_000, 1],
      ["11", 25_000, 2],
    ]);
    expect(await getMaintenancePropertyPreapproval(admin, "10", db)).toMatchObject({
      amount_cents: 50_000,
      effective_from_iso: EFFECTIVE,
      recorded_by_uid: "admin-1",
      note: NOTE,
      version: 1,
    });
    expect(await getMaintenancePropertyPreapproval(admin, "12", db)).toMatchObject({
      amount_cents: 40_000,
      version: 1,
    });
    const history = await listMaintenancePropertyPreapprovalActivity(admin, "11", db);
    expect(history[0]).toMatchObject({
      action: "set",
      amount_cents: 25_000,
      previous_amount_cents: 20_000,
      version: 2,
      note: NOTE,
    });
  });

  it("refuses the whole import when any property changed after the preview (AC-S108-6)", async () => {
    await manual("21", 20_000);
    const plan = planPreapprovalImport(
      [property("20", "500.00"), property("21", "250.00")],
      [(await getMaintenancePropertyPreapproval(admin, "21", db))!],
    );
    await manual("21", 30_000);

    await expect(
      importMaintenancePropertyPreapprovals(
        admin,
        { rows: plan.rows, effectiveFromIso: EFFECTIVE, note: NOTE },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await getMaintenancePropertyPreapproval(admin, "20", db)).toBeNull();
    expect(await getMaintenancePropertyPreapproval(admin, "21", db)).toMatchObject({
      amount_cents: 30_000,
      version: 2,
    });
  });

  it("refuses an addition when a preapproval appeared after the preview", async () => {
    const plan = planPreapprovalImport([property("30", "500.00")], []);
    await manual("30", 10_000);
    await expect(
      importMaintenancePropertyPreapprovals(
        admin,
        { rows: plan.rows, effectiveFromIso: EFFECTIVE, note: NOTE },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await getMaintenancePropertyPreapproval(admin, "30", db)).toMatchObject({
      amount_cents: 10_000,
      version: 1,
    });
  });

  it("leaves unchanged rows and every property outside the plan untouched", async () => {
    await manual("40", 40_000);
    await manual("41", 15_000);
    const plan = planPreapprovalImport(
      [property("40", "400.00")],
      [(await getMaintenancePropertyPreapproval(admin, "40", db))!],
    );
    expect(
      await importMaintenancePropertyPreapprovals(
        admin,
        { rows: plan.rows, effectiveFromIso: EFFECTIVE, note: NOTE },
        db,
      ),
    ).toEqual([]);
    expect(await getMaintenancePropertyPreapproval(admin, "40", db)).toMatchObject({
      version: 1,
    });
    expect(await getMaintenancePropertyPreapproval(admin, "41", db)).toMatchObject({
      amount_cents: 15_000,
      version: 1,
    });
  });

  it("is available only to a current Admin", async () => {
    const plan = planPreapprovalImport([property("50", "500.00")], []);
    for (const actor of [editor, approver]) {
      await expect(
        importMaintenancePropertyPreapprovals(
          actor,
          { rows: plan.rows, effectiveFromIso: EFFECTIVE, note: NOTE },
          db,
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
    expect(await getMaintenancePropertyPreapproval(admin, "50", db)).toBeNull();
  });
});
