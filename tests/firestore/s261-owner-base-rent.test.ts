import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import type { AuthenticatedUser } from "@/lib/auth/session";

// S261 on the real owner message path (AC-S261-1 through AC-S261-3, BEH-S261-1 through
// BEH-S261-3): the owner preview reads the one verified base from the lease's base, its charges
// and the working correction; it never reads the payment total as rent. Wording saved from an
// earlier base is kept exactly and needs staff review before the exact review. An ordinary
// correction changes no source, never touches the recommendation, and a stale tab or preparation
// cannot overwrite a newer correction. RentVine is a deterministic fake; values are synthetic.

const source = vi.hoisted(() => ({
  baseRentAmount: 900 as number | null,
  rentAmount: 940 as number | null,
  /** Recurring charges by id; "timeout" makes the charge list read fail. */
  charges: [] as Array<{ id: string; amount: string; label: string; isRent: boolean }>,
  chargesTimeout: false,
  providerCalls: [] as string[],
}));

vi.mock("@/lib/lease-renewal/live-config", async (original) => {
  const actual = await original<typeof import("@/lib/lease-renewal/live-config")>();
  const { withFakeLeaseDetail } = await import("@/tests/helpers/rentvine-detail-fake");
  const reader = withFakeLeaseDetail({
    listAllLeasesExport: async () => ({
      rows: [
        {
          lease: {
            leaseID: 701,
            leaseStatusID: "2",
            startDate: "2026-01-01",
            endDate: "2026-12-31",
            baseRentAmount: source.baseRentAmount,
            rentAmount: source.rentAmount,
            noticeDate: null,
            expectedMoveOutDate: null,
            moveOutDate: null,
            tenants: [
              {
                contactID: "1701",
                name: "Sample Tenant",
                email: "tenant701@example.invalid",
              },
            ],
          },
          unit: { unitID: "2701", rent: "1000.00" },
          property: { streetName: "701 Example Avenue" },
          portfolio: {
            portfolioID: 9701,
            owners: [
              {
                contactID: "3701",
                name: "Sample Owner",
                firstName: "Sample",
                email: "owner@example.invalid",
              },
            ],
          },
        },
      ],
      pages: 1,
      complete: true,
    }),
    listLeaseStatuses: async () => [
      {
        leaseStatusID: "2",
        name: "Sample Active",
        primaryLeaseStatusID: "2",
        isPendingMoveOutStatus: false,
        isCompletedMoveOutStatus: false,
        isPendingMoveInStatus: false,
        isSystemStatus: true,
      },
    ],
  });
  const chargeReads = {
    getLease: async (leaseId: string) => {
      source.providerCalls.push(`GET lease ${leaseId}`);
      return { leaseID: leaseId, startDate: "2026-01-01", endDate: "2026-12-31" };
    },
    listRecurringCharges: async (leaseId: string) => {
      source.providerCalls.push(`GET charges ${leaseId}`);
      if (source.chargesTimeout)
        throw new DOMException("synthetic charge read timeout", "TimeoutError");
      return source.charges.map((charge) => ({ leaseRecurringChargeID: charge.id }));
    },
    getRecurringCharge: async (leaseId: string, chargeId: string) => {
      const charge = source.charges.find((entry) => entry.id === chargeId)!;
      const accountID = charge.isRent ? "9" : "15";
      return {
        leaseRecurringChargeID: chargeId,
        leaseID: leaseId,
        accountID,
        amount: charge.amount,
        description: charge.label,
        dayDue: "1",
        frequency: "1",
        startDate: "2026-01-01",
        endDate: null,
        nextChargeDate: null,
        isMoveInCharge: "0",
        isFromImport: "0",
        rentIncreaseID: null,
        importSourceKey: null,
        recurringStatusID: 1,
        account: { accountID, isRent: charge.isRent ? 1 : 0, name: charge.label },
      };
    },
  };
  return {
    ...actual,
    buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: reader }),
    buildLiveRenewalConfig: () => ({ ok: true, rentvineClient: chargeReads }),
  };
});

import { saveMessagePreparation } from "@/lib/firestore/renewal-message-preparations";
import {
  getRenewalWorkingRecord,
  listRenewalWorkingActivity,
  saveRenewalWorkingField,
} from "@/lib/firestore/renewal-working-record";
import { ensureRenewalWorkRecord } from "@/lib/firestore/renewal-workspace";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { composedBodyHash } from "@/lib/firestore/renewal-message-body-overrides";
import { workingBaseFingerprint } from "@/lib/lease-renewal/message-claim-basis";

const projectId = "pmi-kc-kb-s261-owner-base-rent";
const editor: AuthenticatedUser = {
  uid: "s261-editor",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s261-owner-base-rent-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await testEnv.clearFirestore();
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
  source.baseRentAmount = 900;
  source.rentAmount = 940;
  source.charges = [
    { id: "501", amount: "900.00", label: "Rent", isRent: true },
    { id: "502", amount: "40.00", label: "Pet Rent", isRent: false },
  ];
  source.chargesTimeout = false;
  source.providerCalls = [];
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
  vi.unstubAllEnvs();
});

async function workRecord() {
  await ensureRenewalWorkRecord(editor, "701", db, async () => ({
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  }));
}

async function correct(field: string, value: number | null, expectedRevision: number) {
  return saveRenewalWorkingField(
    editor,
    {
      leaseId: "701",
      field,
      value,
      expectedRevision,
      operationId: randomUUID(),
      origin: "staff_entry",
    },
    db,
  );
}

async function rootCollections() {
  return (await db.listCollections()).map((collection) => collection.id).sort();
}

describe("S261 the owner preview reads the verified base", () => {
  it("AC-S261-2 / BEH-S261-2: the preview, its exact basis and the reopened message read the $900 base and the saved proposed base, never the $940 total", async () => {
    await workRecord();
    const first = await currentRenewalMessage(editor, "701", "owner", db);
    expect(first.facts.currentBaseRent?.value).toBe(900);
    expect(first.content.plainText).toContain(
      "We are currently charging them $900.00 per month.",
    );
    expect(first.content.plainText).not.toContain("$940");
    expect(first.content.plainText).not.toContain("$1,000.00");
    // S163: the greeting names the verified party by first name.
    expect(first.content.plainText).toMatch(/^Hello Sample,/);
    // The exact draft basis is bound to the base correction it was calculated from.
    expect(first.basis.workingBaseFingerprint).toBe(workingBaseFingerprint(null));
    // The proposed base staff save is what the owner reads after a reopen.
    await correct("terms_rent", 1000, 0);
    await saveMessagePreparation(
      editor,
      {
        leaseId: "701",
        cycleId: first.workspace!.cycleId,
        channel: "owner",
        expectedRevision: 0,
        operationId: randomUUID(),
        inputs: first.inputs,
      },
      {},
      db,
    );
    clearLiveLeaseCache();
    const reopened = await currentRenewalMessage(editor, "701", "owner", db);
    expect(reopened.saved?.revision).toBe(1);
    expect(reopened.facts.currentBaseRent?.value).toBe(900);
    expect(reopened.rentToRecommend).toMatchObject({ value: 1000, origin: "typed" });
    expect(reopened.content.plainText).toContain(
      "We are currently charging them $900.00 per month.",
    );
    expect(reopened.content.plainText).toContain("$1,000.00");
    expect(reopened.outgoingReasons.join(" ")).not.toMatch(/base rent/i);
  });

  it("BEH-S261-1 / AC-S261-1: with the charge read timing out and no contractual base, the owner message names what to verify", async () => {
    source.baseRentAmount = null;
    source.chargesTimeout = true;
    await workRecord();
    const message = await currentRenewalMessage(editor, "701", "owner", db);
    expect(message.facts.currentBaseRent).toBeNull();
    const missing = message.content.missing.find(
      (entry) => entry.field === "currentBaseRent",
    );
    expect(missing?.message).toMatch(/could not be read/);
    expect(missing?.message).toMatch(/working current rent/);
    expect(message.content.plainText).toContain("[Needs Verification: current rent]");
    expect(message.content.plainText).not.toContain("$940");
    expect(message.outgoingReasons).toContain(missing!.message);
  });

  it("BEH-S261-2 / ARCH-S261-2: wording saved from an earlier $940 base is kept exactly and needs staff review before the exact review", async () => {
    // The earlier read: RentVine's base included the pet line and no rent charge was listed.
    source.baseRentAmount = 940;
    source.charges = [];
    await workRecord();
    const earlier = await currentRenewalMessage(editor, "701", "owner", db);
    expect(earlier.facts.currentBaseRent?.value).toBe(940);
    const wording = `${earlier.content.plainText}\n\nThank you for reviewing this renewal.`;
    await saveMessagePreparation(
      editor,
      {
        leaseId: "701",
        cycleId: earlier.workspace!.cycleId,
        channel: "owner",
        expectedRevision: 0,
        operationId: randomUUID(),
        inputs: earlier.inputs,
        bodyOverride: {
          text: wording,
          baseHash: composedBodyHash(earlier.composedContent.plainText),
        },
      },
      {},
      db,
    );
    // Staff resolve the base once with the existing working correction.
    await correct("current_rent", 900, 0);
    clearLiveLeaseCache();
    const later = await currentRenewalMessage(editor, "701", "owner", db);
    expect(later.facts.currentBaseRent?.value).toBe(900);
    // The saved bytes stay as written; S161 never rewrites authored wording.
    expect(later.bodyOverride).toMatchObject({ text: wording });
    expect(later.content.plainText).toContain("$940.00");
    const review = later.outgoingReasons.find((reason) => reason.includes("$940.00"));
    expect(review).toMatch(/\$900\.00/);
    // Returning to the standard wording is the staff review that clears it.
    await saveMessagePreparation(
      editor,
      {
        leaseId: "701",
        cycleId: later.workspace!.cycleId,
        channel: "owner",
        expectedRevision: later.saved!.revision,
        operationId: randomUUID(),
        inputs: later.inputs,
      },
      {},
      db,
    );
    const rebuilt = await currentRenewalMessage(editor, "701", "owner", db);
    expect(rebuilt.content.plainText).toContain(
      "We are currently charging them $900.00 per month.",
    );
    expect(rebuilt.outgoingReasons.some((reason) => reason.includes("$940.00"))).toBe(
      false,
    );
  });
});

describe("S261 R-S261-3 scoped staff corrections", () => {
  it("AC-S261-3 / ARCH-S261-3: a correction changes no source and keeps the recommendation; stale tabs and preparation cannot overwrite a newer correction", async () => {
    await workRecord();
    await correct("terms_rent", 1000, 0);
    const before = await rootCollections();
    source.providerCalls = [];
    await correct("current_rent", 900, 0);
    // A stale tab that read the record before the correction is refused with the current value kept.
    await expect(correct("current_rent", 905, 0)).rejects.toThrow(
      /Another operator changed this value/,
    );
    // A newer correction, then a tab still holding the first revision.
    await correct("current_rent", 910, 1);
    await expect(correct("current_rent", 905, 1)).rejects.toThrow(
      /Another operator changed this value/,
    );
    // Preparation fills only an empty recommendation; it never writes the current rent.
    await expect(
      saveRenewalWorkingField(
        editor,
        {
          leaseId: "701",
          field: "current_rent",
          value: 940,
          expectedRevision: 2,
          operationId: randomUUID(),
        },
        db,
        { cycleId: randomUUID(), dateIso: "2026-12-31" },
      ),
    ).rejects.toThrow(/Only a recommendation can fill/);
    await expect(
      saveRenewalWorkingField(
        editor,
        {
          leaseId: "701",
          field: "terms_rent",
          value: 1100,
          expectedRevision: 1,
          operationId: randomUUID(),
        },
        db,
        { cycleId: randomUUID(), dateIso: "2026-12-31" },
      ),
    ).rejects.toThrow(/Review Rent to recommend/);
    // Read the working revision and the ledger after every attempt completed.
    const record = await getRenewalWorkingRecord(editor, "701", db);
    expect(record?.fields.current_rent).toMatchObject({ value: 910, revision: 2 });
    expect(record?.fields.terms_rent).toMatchObject({ value: 1000, revision: 1 });
    const activity = await listRenewalWorkingActivity(editor, "701", db);
    expect(
      activity
        .filter((entry) => entry.field === "current_rent")
        .map((entry) => [entry.value, entry.revision]),
    ).toEqual([
      [900, 1],
      [910, 2],
    ]);
    // No provider call, no attempt and no receipt: only the app's own working record changed.
    expect(source.providerCalls).toEqual([]);
    expect(await rootCollections()).toEqual(before);
    const reread = await currentRenewalMessage(editor, "701", "owner", db);
    expect(reread.facts.currentBaseRent).toMatchObject({ value: 910 });
    expect(reread.rentToRecommend).toMatchObject({ value: 1000, origin: "typed" });
  });
});

describe("S261 R-S261-4 opening a lease reads existing work only", () => {
  it("BEH-S261-4: reading the saved owner message twice writes nothing and starts no lookup or preparation", async () => {
    await workRecord();
    const first = await currentRenewalMessage(editor, "701", "owner", db);
    await saveMessagePreparation(
      editor,
      {
        leaseId: "701",
        cycleId: first.workspace!.cycleId,
        channel: "owner",
        expectedRevision: 0,
        operationId: randomUUID(),
        inputs: first.inputs,
      },
      {},
      db,
    );
    const collections = await rootCollections();
    const snapshot = async () =>
      Object.fromEntries(
        await Promise.all(
          collections.map(async (name) => [
            name,
            (await db.collection(name).get()).docs.map((doc) => [doc.id, doc.data()]),
          ]),
        ),
      );
    const stored = await snapshot();
    for (let index = 0; index < 2; index += 1) {
      clearLiveLeaseCache();
      const reopened = await currentRenewalMessage(editor, "701", "owner", db);
      expect(reopened.saved?.revision).toBe(1);
      expect(reopened.draftAttempt).toBeNull();
    }
    expect(await rootCollections()).toEqual(collections);
    expect(await snapshot()).toEqual(stored);
    expect(collections).not.toContain("rentcast_usage");
    expect(collections).not.toContain("renewal_kickoff_preparations");
  });
});
