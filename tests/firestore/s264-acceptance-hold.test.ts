import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { RenewalWritebackDependencies } from "@/lib/lease-renewal/writeback/execution-service";
import type { SheetWritebackWriter } from "@/lib/lease-renewal/sheet-writeback/execution-service";
import type { FreshOperatingSheetLeaseContext } from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

// S264 R-S264-6 (AC-S264-6) at the source-update claims, against the Firestore emulator with
// synthetic adapters. The tenant accepts an exact offer; then only one selected charge changes
// through the tenant message's actual save. The source updates that apply the accepted renewal
// (the RentVine lease dates, and the operating Sheet renewal date) are previewed and then refused
// before their one-attempt claim with the exact difference, and no provider writer runs. An update
// that does not rely on the answer proceeds, the answer stays exactly as recorded, and once the
// tenant's answer for the current offer is recorded the same update applies once with its receipt.
// The claim composes the current offer from app records only: the RentVine lines the tenant
// message's save kept, never a new provider read, and never lines kept before the offer was sent.

const state = vi.hoisted(() => ({
  db: null as Firestore | null,
  actor: {
    uid: "synthetic-s264-hold",
    email: "synthetic-s264-hold@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  } as AuthenticatedUser,
  charges: [] as Array<Record<string, unknown>>,
  rentvine: null as RenewalWritebackDependencies | null,
  writer: null as SheetWritebackWriter | null,
  context: null as (() => FreshOperatingSheetLeaseContext) | null,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/session", async (original) => {
  const actual = await original<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireCapabilityInSpace: async () => state.actor,
    requireCapability: async () => state.actor,
  };
});
vi.mock("@/lib/lease-renewal/live-config", async (original) => {
  const actual = await original<typeof import("@/lib/lease-renewal/live-config")>();
  const { withFakeLeaseDetail } = await import("@/tests/helpers/rentvine-detail-fake");
  const reader = withFakeLeaseDetail({
    listAllLeasesExport: async () => ({
      complete: true,
      pages: 1,
      rows: [
        {
          lease: {
            leaseID: 9764,
            leaseStatusID: "2",
            endDate: "2027-01-31",
            baseRentAmount: 900,
            noticeDate: null,
            expectedMoveOutDate: null,
            moveOutDate: null,
            tenants: [
              {
                contactID: "19764",
                name: "Synthetic Tenant",
                firstName: "Synthetic",
                email: "tenant@fixture.invalid",
              },
            ],
          },
          unit: { unitID: "29764" },
          property: { streetName: "9764 Synthetic Fixture Avenue" },
          portfolio: {
            owners: [{ name: "Synthetic Owner", email: "owner@fixture.invalid" }],
          },
        },
      ],
    }),
    listLeaseStatuses: async () => [
      {
        leaseStatusID: "2",
        name: "Synthetic Active",
        primaryLeaseStatusID: "2",
        isPendingMoveOutStatus: false,
        isCompletedMoveOutStatus: false,
        isPendingMoveInStatus: false,
        isSystemStatus: true,
      },
    ],
  });
  return {
    ...actual,
    buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: reader }),
    buildLiveRenewalConfig: () => ({
      ok: true,
      rentvineClient: reader,
      rentvineHost: "fixture.invalid",
      sheetsReader: null,
      spreadsheetId: "synthetic-sheet",
    }),
  };
});
vi.mock("@/lib/lease-renewal/writeback/charge-inventory", async (original) => ({
  ...(await original<typeof import("@/lib/lease-renewal/writeback/charge-inventory")>()),
  loadRenewalChargeInventory: async (_client: unknown, leaseId: string) => ({
    leaseId,
    leaseDates: {
      startDate: "2026-02-01",
      endDate: "2027-01-31",
      increaseEligibilityDate: null,
    },
    asOfDate: "2026-11-10",
    charges: structuredClone(state.charges),
  }),
}));
vi.mock("@/lib/gmail-hub/dependencies", async (original) => ({
  ...(await original<typeof import("@/lib/gmail-hub/dependencies")>()),
  createDescriptorBoundGmailRuntimeClient: () => {
    throw new Error("No real Gmail effect in this test");
  },
}));
vi.mock("@/lib/lease-renewal/writeback/live", () => ({
  buildLiveRenewalWritebackDeps: () => state.rentvine,
  assertRenewalWritebackExecutionAllowed: async () => undefined,
}));
vi.mock("@/lib/google-sheets/write-client", () => ({
  GoogleSheetsApiWriter: class {
    constructor() {
      return state.writer!;
    }
  },
}));
vi.mock("@/lib/lease-renewal/sheet-writeback/workspace-resolution", async (original) => ({
  ...(await original<
    typeof import("@/lib/lease-renewal/sheet-writeback/workspace-resolution")
  >()),
  resolveFreshOperatingSheetLeaseContext: async () => state.context!(),
}));

import { POST as rentvineWriteback } from "@/app/api/lease-renewal/rentvine-writeback/route";
import { POST as operatingSheet } from "@/app/api/lease-renewal/operating-sheet/route";
import { POST as messagePreparation } from "@/app/api/lease-renewal/message-preparation/route";
import { publishSuppliedRenewalTemplate } from "@/lib/firestore/renewal-message-publication";
import { saveSenderSignatureChoice } from "@/lib/firestore/renewal-sender-signature-choice";
import { saveRenewalWorkingField } from "@/lib/firestore/renewal-working-record";
import { saveMessagePreparation } from "@/lib/firestore/renewal-message-preparations";
import {
  readOfferChargeMappings,
  saveOfferChargeMappings,
} from "@/lib/firestore/renewal-offer-charge-mappings";
import {
  OFFER_ANSWER_COLLECTION,
  readOfferAnswer,
} from "@/lib/firestore/renewal-offer-answers";
import {
  readOfferSource,
  recordOfferSource,
} from "@/lib/firestore/renewal-offer-sources";
import {
  getRenewalWorkspace,
  saveRenewalWorkspace,
} from "@/lib/firestore/renewal-workspace";
import {
  EXTERNAL_EXECUTION_COLLECTIONS,
  FirestoreExternalExecutionStore,
} from "@/lib/firestore/external-action-executions";
import { claimActiveS97RenewalEffect } from "@/lib/firestore/s97-renewal-writeback-claim";
import { getRenewalWritebackProposal } from "@/lib/lease-renewal/writeback/proposal-store";
import { getSheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/proposal-store";
import { mintSheetWorkspaceContext } from "@/lib/lease-renewal/sheet-writeback/workspace-context";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { readTenantAcceptanceCheck } from "@/lib/lease-renewal/tenant-offer-composition";
import {
  acceptanceHoldRefusal,
  OFFER_ANSWER_SCHEMA_VERSION,
  type OfferAnswerRecord,
} from "@/lib/lease-renewal/offer-answers";
import {
  offerChargeSource,
  type FrozenOfferSnapshot,
} from "@/lib/lease-renewal/offer-snapshot";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import {
  emptyOfferChargeSelection,
  type OfferChargeSelection,
} from "@/lib/lease-renewal/offer-charges";
import type { OfferChargeMappingEntry } from "@/lib/lease-renewal/offer-charge-mapping";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";

const projectId = "demo-pmi-s264-acceptance-hold";
const admin: AuthenticatedUser = {
  uid: "synthetic-s264-hold-admin",
  email: "synthetic-s264-hold-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const LEASE = "9764";
const RENEWAL = "2027-02-01";
const SPREADSHEET = "s264-synthetic-sheet";
const HEADER = [
  "What is the Lease/Tenant name?",
  "Market Value",
  "Current Rent",
  "Renewal Date",
];
const LINE =
  "Current acceptance needs verification: it answers an earlier offer. Pet rent changed ($45.00 to $50.00).";
const PET: OfferChargeMappingEntry = {
  entryId: "00000000-0000-4000-8000-000000009101",
  accountId: "9101",
  accountName: "Synthetic account 9101",
  displayLabel: "Pet rent",
  family: "pet",
  frequencyMonths: 1,
  applicability: "active_on_renewal_date",
  requirement: null,
  approval: { reference: "Synthetic approval note", approvedOn: "2026-11-01" },
};
let app: App, db: Firestore, testEnv: RulesTestEnvironment;
let leaseDates: {
  startDate: string;
  endDate: string | null;
  increaseEligibilityDate: string | null;
};
let leaseUpdates = 0;
let marketValue = "1000";
let sheetMutations = 0;
let token = "";

function charge(id: string, accountId: string, amount: string, rent = false) {
  return {
    id,
    accountId,
    accountLabel: `Synthetic account ${accountId}`,
    classification: rent ? "rent" : "non_rent",
    current: true,
    projection: {
      leaseRecurringChargeID: id,
      leaseID: LEASE,
      accountID: accountId,
      amount,
      description: rent ? "Synthetic rent" : "Synthetic line",
      dayDue: "1",
      frequency: "1",
      startDate: "2026-02-01",
      isMoveInCharge: "0",
      isFromImport: "0",
      endDate: null,
      nextChargeDate: "2026-12-01",
      rentIncreaseID: null,
      importSourceKey: null,
      recurringStatusID: 1,
    },
  };
}

function cellEvidence() {
  return {
    value: { numberValue: Number(marketValue) },
    formattedValue: marketValue,
    numberFormat: "NUMBER",
    checkbox: false,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s264-hold-${process.pid}`);
  db = getFirestore(app);
  state.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  vi.stubEnv("RENEWAL_SHEET_ID", SPREADSHEET);
  vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
  vi.stubEnv("K_REVISION", "pmi-kc-app-test-s264-hold");
  vi.stubEnv("RENEWAL_DESK_PARTY_FILTER_KEY", Buffer.alloc(32, 31).toString("base64url"));
});
beforeEach(async () => {
  await testEnv.clearFirestore();
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
  state.charges = [charge("510", "9100", "900.00", true), charge("511", "9101", "45.00")];
  leaseDates = {
    startDate: "2026-02-01",
    endDate: "2027-01-31",
    increaseEligibilityDate: null,
  };
  leaseUpdates = 0;
  marketValue = "1000";
  sheetMutations = 0;
  token = mintSheetWorkspaceContext(state.actor.uid, LEASE)!;
  state.rentvine = {
    descriptor: {
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    },
    store: new FirestoreExternalExecutionStore(db),
    reads: {
      getLease: async () => ({ leaseID: LEASE, ...leaseDates }),
      listRecurringCharges: async () => [],
      getRecurringCharge: async () => {
        throw new Error("No recurring charge read in this test");
      },
    },
    gateFor: () => ({ isExecutable: async () => true, run: async (work) => work() }),
    claimActiveEffect: (input) => claimActiveS97RenewalEffect(db, input),
    createWriter: () => ({
      updateLease: async (_lease, payload) => {
        leaseUpdates++;
        leaseDates = { ...leaseDates, ...payload } as typeof leaseDates;
        return { lease: { leaseID: LEASE, ...leaseDates } };
      },
      updateExistingRecurringCharge: async () => {
        throw new Error("Unexpected effect");
      },
      createRecurringCharge: async () => {
        throw new Error("Unexpected effect");
      },
      deleteRecurringChargeForCreateReversal: async () => {
        throw new Error("Unexpected effect");
      },
    }),
  };
  state.context = () => ({
    leaseId: LEASE,
    propertyId: "19764",
    tenantName: "Synthetic Tenant",
    sourceReadAtIso: new Date().toISOString(),
    header: HEADER,
    columns: new Map([
      ["tenant_name", 0],
      ["market_value", 1],
      ["current_rent", 2],
      ["renewal_date", 3],
    ]),
    tenantColumnIndex: 0,
    association: { kind: "exact_link", rowNumber: 2 },
    row: {
      rowNumber: 2,
      rowKey: null,
      anchorTenantName: "Synthetic Tenant",
      currentRentValue: "900",
      currentRentSourceTriggerKey: null,
      currentRentCandidateFingerprint: null,
      fieldValues: {
        market_value: marketValue,
        current_rent: "900",
        renewal_date: "01/31/2027",
      },
      formulaFields: [],
      cellEvidence: { market_value: cellEvidence() },
    },
  });
  state.writer = {
    async getValues(_id, range) {
      if (range.endsWith("A1:AZ1")) return [HEADER];
      if (range.endsWith("A2:A2")) return [["Synthetic Tenant"]];
      if (range.endsWith("B2:B2")) return [[marketValue]];
      throw new Error("Unexpected exact read");
    },
    async getCellEvidence() {
      return cellEvidence();
    },
    async getSheetIdByTitle() {
      return 0;
    },
    async getColumnNotes() {
      return [{ rowNumber: 2, value: "Synthetic Tenant", note: "" }];
    },
    async replaceCellIfExactMatch(_id, range, before, after) {
      expect(range).toBe("'Lease Renewal'!B2");
      if (before !== marketValue) return false;
      sheetMutations++;
      marketValue = after;
      return true;
    },
    async appendRowWithNote() {
      throw new Error("Unexpected append");
    },
    async deleteExactRow() {
      throw new Error("Deletion is unavailable");
    },
  };
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
  vi.unstubAllEnvs();
});

async function currentOffer(): Promise<FrozenOfferSnapshot> {
  clearLiveLeaseCache();
  return (await currentRenewalMessage(state.actor, LEASE, "tenant", db)).offerCharges!
    .snapshot;
}

async function setUp() {
  const mappings = await readOfferChargeMappings(db);
  await saveOfferChargeMappings(
    admin,
    {
      entries: [PET],
      expectedVersion: mappings.record?.version ?? 0,
      operationId: randomUUID(),
    },
    db,
  );
  await publishSuppliedRenewalTemplate(admin, "tenant", db);
  await saveSenderSignatureChoice(
    state.actor,
    { expectedRevision: 0, operationId: randomUUID(), signature: null },
    db,
  );
  for (const [field, value] of [
    ["terms_rent", 920],
    ["terms_effective_date", RENEWAL],
    ["terms_end_date", "2028-01-31"],
  ] as const)
    await saveRenewalWorkingField(
      state.actor,
      { leaseId: LEASE, field, value, expectedRevision: 0, operationId: randomUUID() },
      db,
    );
  await saveMessagePreparation(
    state.actor,
    {
      leaseId: LEASE,
      channel: "tenant",
      expectedRevision: 0,
      operationId: randomUUID(),
      inputs: {
        ...emptyMessagePreparationInputs(),
        leaseOrigin: { kind: "pmi", source: "Synthetic original lease" },
      },
    },
    {
      resolveBasis: async () => ({
        kind: "lease_end",
        dateIso: "2027-01-31",
        source: "RentVine lease end",
      }),
    },
    db,
  );
}

/**
 * The tenant's acceptance, recorded on the work record, with the exact offer it answered (the
 * offer a confirmed send carried, here a synthetic one sent at `sentAtMs`).
 */
async function acceptWithOffer(offer: FrozenOfferSnapshot, sentAtMs: number) {
  const before = (await getRenewalWorkspace(state.actor, LEASE, db))!;
  const saved = await saveRenewalWorkspace(
    state.actor,
    {
      leaseId: LEASE,
      cycleId: before.cycleId,
      expectedRevision: before.revision,
      operationId: randomUUID(),
      action: { kind: "tenant_response", outcome: "accepted" },
    },
    db,
  );
  const eventId = saved.state!.tenantResponse!.eventId;
  const record: OfferAnswerRecord = {
    schemaVersion: OFFER_ANSWER_SCHEMA_VERSION,
    leaseId: LEASE,
    cycleId: saved.state!.cycleId,
    eventId,
    party: "tenant",
    outcome: "accepted",
    attribution: {
      kind: "linked_communication",
      sequenceId: "synthetic-sequence",
      occurrenceId: "synthetic-occurrence",
      sentAtMs,
    },
    offer,
    recordedAt: new Date().toISOString(),
    recordedByUid: state.actor.uid,
  };
  await db.collection(OFFER_ANSWER_COLLECTION).doc(eventId).create(record);
  return { eventId, record };
}

/** Only the pet charge changes, saved through the tenant message's actual save route. */
async function changePetRentThroughSave(cents: number) {
  const before = await currentOffer();
  const saved = (await currentRenewalMessage(state.actor, LEASE, "tenant", db)).saved!;
  const selection: OfferChargeSelection = {
    ...emptyOfferChargeSelection(),
    decisions: [
      {
        rowKey: "rentvine:511",
        choice: "include",
        reason: null,
        renewalAmountCents: cents,
        effectiveDate: null,
        correctionSource: "Synthetic signed pet addendum",
        reviewed: {
          sourceVersion: before.snapshot.rows[0]!.sourceVersion,
          renewalDate: RENEWAL,
          mappingVersion: 1,
        },
      },
    ],
  };
  clearLiveLeaseCache();
  return messagePreparation(
    new Request("http://local.test/api/lease-renewal/message-preparation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "save",
        leaseId: LEASE,
        channel: "tenant",
        expectedRevision: saved.revision,
        operationId: randomUUID(),
        inputs: saved.inputs,
        offerCharges: selection,
      }),
    }),
  );
}

function rentvine(body: Record<string, unknown>) {
  return rentvineWriteback(
    new Request("http://local.test/api/lease-renewal/rentvine-writeback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
async function proposeLeaseEnd() {
  const response = await rentvine({
    operation: "propose",
    leaseId: LEASE,
    expectedPriorPreviewHash: null,
    effects: [{ kind: "renewal_dates_update", after: { endDate: "2028-01-31" } }],
  });
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
  return (await getRenewalWritebackProposal(state.actor, LEASE, db))!;
}
function applyRentvine(
  proposal: Awaited<ReturnType<typeof proposeLeaseEnd>>,
): Promise<Response> {
  return rentvine({
    operation: "execute",
    leaseId: LEASE,
    previewHash: proposal.previewHash,
    effectHash: proposal.effects[0]!.effectHash,
    confirm: true,
  });
}

function sheet(body: Record<string, unknown>) {
  return operatingSheet(
    new Request("http://local.test/api/lease-renewal/operating-sheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceContext: token, ...body }),
    }),
  );
}
async function proposeSheet(
  fieldIntent: Record<string, unknown>,
  previous: string | null = null,
) {
  const response = await sheet({
    operation: "propose",
    intent: "update_field",
    expectedPriorPreviewHash: previous,
    fieldIntent,
  });
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
  return (await getSheetWritebackProposal(
    state.actor,
    SPREADSHEET,
    "Lease Renewal",
    { kind: "lease_workspace", leaseId: LEASE },
    db,
  ))!;
}
function applySheet(proposal: Awaited<ReturnType<typeof proposeSheet>>) {
  return sheet({
    operation: "execute",
    confirm: true,
    previewHash: proposal.previewHash,
    effectHash: proposal.effects[0]!.effectHash,
  });
}

function inventoryOf(charges: Array<Record<string, unknown>>): RenewalChargeInventory {
  return {
    leaseId: LEASE,
    leaseDates: {
      startDate: "2026-02-01",
      endDate: "2027-01-31",
      increaseEligibilityDate: null,
    },
    asOfDate: "2026-11-10",
    charges,
  } as unknown as RenewalChargeInventory;
}

describe("S264 AC-S264-6 an earlier acceptance never reaches a source-update claim after a charge-only change", () => {
  it("holds the RentVine lease dates and the Sheet renewal date before claim with the exact difference; the answer for the current offer lets them apply", async () => {
    await setUp();
    const answered = await currentOffer();
    expect(answered.snapshot.rows).toEqual([
      expect.objectContaining({ rowKey: "rentvine:511", amountCents: 4500 }),
    ]);
    const accepted = await acceptWithOffer(answered, Date.now() - 60_000);

    // Only one selected charge changes, through the tenant message's actual save.
    const saved = await changePetRentThroughSave(5000);
    const savedBody = await saved.json();
    expect(saved.status, JSON.stringify(savedBody)).toBe(200);
    // The message read the editors use says why the answer is earlier, for the stage too.
    expect(savedBody.offerAnswers.acceptance).toEqual({
      eventId: accepted.eventId,
      state: "earlier_offer",
      line: LINE,
    });
    // The save kept the RentVine lines it read, so a claim composes the offer from app records.
    expect(await readOfferSource(db, LEASE)).toMatchObject({
      source: { state: "read", lines: expect.any(Array) },
    });
    expect(
      await readTenantAcceptanceCheck({ actor: state.actor, leaseId: LEASE, db }),
    ).toEqual({ eventId: accepted.eventId, state: "earlier_offer", line: LINE });

    // The RentVine lease end date is previewed, then held before its claim. No writer runs and
    // no attempt is created, so nothing needs reconciling.
    const leaseEnd = await proposeLeaseEnd();
    const held = await applyRentvine(leaseEnd);
    expect(held.status).toBe(409);
    expect(await held.json()).toEqual({
      error: acceptanceHoldRefusal(LINE),
      error_type: "acceptance_needs_verification",
    });
    expect(leaseUpdates).toBe(0);
    expect(
      (await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).get()).docs.filter(
        (doc) => doc.get("actionKey") === "rentvine.lease.renewal_dates.update",
      ),
    ).toEqual([]);

    // The Sheet renewal date carries the accepted terms and holds too; a market value does not
    // rely on the tenant's answer and is applied once.
    const renewalDate = await proposeSheet({
      field: "renewal_date",
      value: "2028-01-31",
      source: "Working renewal terms",
    });
    const sheetHeld = await applySheet(renewalDate);
    expect(sheetHeld.status).toBe(409);
    expect(await sheetHeld.json()).toEqual({
      error: acceptanceHoldRefusal(LINE),
      error_type: "acceptance_needs_verification",
    });
    expect(sheetMutations).toBe(0);
    const market = await proposeSheet(
      { field: "market_value", value: 1100, source: "Synthetic comparables" },
      renewalDate.previewHash,
    );
    const marketApplied = await applySheet(market);
    expect(marketApplied.status, JSON.stringify(await marketApplied.clone().json())).toBe(
      200,
    );
    expect(sheetMutations).toBe(1);

    // The earlier answer and the exact offer it covered stay as recorded.
    expect(await readOfferAnswer(db, accepted.eventId)).toEqual(accepted.record);

    // The tenant's answer for the current offer, recorded with it, lets the same update apply
    // once with its receipt; the earlier answer remains history.
    const current = await currentOffer();
    const kept = (await readOfferSource(db, LEASE))!;
    const covering = await acceptWithOffer(current, Date.parse(kept.readAt) - 1);
    expect(
      await readTenantAcceptanceCheck({ actor: state.actor, leaseId: LEASE, db }),
    ).toEqual({ eventId: covering.eventId, state: "covers", line: null });
    const applied = await applyRentvine(leaseEnd);
    expect(applied.status, JSON.stringify(await applied.clone().json())).toBe(200);
    expect((await applied.json()).receipt).toBeTruthy();
    expect(leaseUpdates).toBe(1);
    expect(leaseDates.endDate).toBe("2028-01-31");
    expect(await readOfferAnswer(db, accepted.eventId)).toEqual(accepted.record);
  });

  it("lines kept before the accepted offer was sent are no basis: the claim reads the acceptance as recorded", async () => {
    await setUp();
    const answered = await currentOffer();
    const sentAtMs = Date.now() - 60_000;
    const accepted = await acceptWithOffer(answered, sentAtMs);
    // RentVine lines kept by a save before the send, with a different pet amount.
    const earlier = offerChargeSource(
      inventoryOf([
        charge("510", "9100", "900.00", true),
        charge("511", "9101", "40.00"),
      ]),
    );
    await recordOfferSource(
      db,
      LEASE,
      earlier,
      new Date(sentAtMs - 60_000).toISOString(),
    );
    expect(
      await readTenantAcceptanceCheck({ actor: state.actor, leaseId: LEASE, db }),
    ).toEqual({ eventId: accepted.eventId, state: "unknown", line: null });
    const leaseEnd = await proposeLeaseEnd();
    expect((await applyRentvine(leaseEnd)).status).toBe(200);
    expect(leaseUpdates).toBe(1);
    // The same lines, kept after the send, are a basis and show the difference.
    await recordOfferSource(db, LEASE, earlier, new Date().toISOString());
    expect(
      await readTenantAcceptanceCheck({ actor: state.actor, leaseId: LEASE, db }),
    ).toMatchObject({ eventId: accepted.eventId, state: "earlier_offer" });
  });
});
