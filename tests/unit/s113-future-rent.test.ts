import { describe, expect, it } from "vitest";
import { loadRenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory";
import {
  assertFutureRentSchedule,
  futureRentInventoryHash,
  futureRentTermsCurrent,
} from "@/lib/lease-renewal/writeback/future-rent-intent";
import { effectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import {
  buildRenewalWritebackProposal,
  projectRecurringCharge,
  type RenewalWritebackEffectInput,
} from "@/lib/lease-renewal/writeback/proposal-contract";
import { RenewalWritebackService } from "@/lib/lease-renewal/writeback/execution-service";
import { MemoryExternalExecutionStore } from "@/lib/external-execution/memory-store";
const now = Date.parse("2026-09-10T12:00:00.000Z"),
  terms = { rent: 1500, effectiveDate: "2027-01-01", endDate: "2027-12-31" };
const current = {
  leaseRecurringChargeID: "301",
  leaseID: "81",
  accountID: "9",
  amount: "1200.00",
  description: "Rent",
  dayDue: "1",
  frequency: "1",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  nextChargeDate: "2026-10-01",
  isMoveInCharge: "0",
  isFromImport: "0",
  rentIncreaseID: null,
  importSourceKey: null,
  recurringStatusID: 1,
  account: { accountID: "9", name: "Rent", isRent: "1" },
};
const future = {
  ...current,
  leaseRecurringChargeID: "302",
  amount: "1400.00",
  startDate: terms.effectiveDate,
  endDate: terms.endDate,
  nextChargeDate: "2027-01-01",
  recurringStatusID: 2,
};
async function setup(entries = [structuredClone(current), structuredClone(future)]) {
  const reads = {
    getLease: async () => ({
      leaseID: "81",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      increaseEligibilityDate: null,
    }),
    listRecurringCharges: async () => entries,
    getRecurringCharge: async (_lease: string, id: string) =>
      entries.find((entry) => entry.leaseRecurringChargeID === id)!,
  };
  const inventory = await loadRenewalChargeInventory(reads, "81", "2026-09-10");
  const binding = {
    cycleId: "b4bc3b81-c402-4f62-a2e2-c605c67867fb",
    termsRevision: 1,
    terms,
    inventoryHash: futureRentInventoryHash(inventory),
    scheduleReview: "Reviewed billing schedule and exact owner approval",
  };
  const effect: RenewalWritebackEffectInput = {
    kind: "recurring_charge_update",
    chargeId: "302",
    before: projectRecurringCharge(future),
    changes: { amount: "1500.00" },
  };
  return { entries, reads, inventory, binding, effect };
}
describe("S113 future rent schedule", () => {
  it("permits only the working future amount and rejects an early current amount replacement", async () => {
    const h = await setup();
    expect(() =>
      assertFutureRentSchedule(h.binding, h.inventory, h.effect),
    ).not.toThrow();
    expect(() =>
      assertFutureRentSchedule(h.binding, h.inventory, {
        kind: "recurring_charge_update",
        chargeId: "301",
        before: projectRecurringCharge(current),
        changes: { amount: "1500.00" },
      }),
    ).toThrow(/future/);
    expect(() =>
      assertFutureRentSchedule(h.binding, h.inventory, {
        ...h.effect,
        changes: { amount: "1501.00" },
      } as RenewalWritebackEffectInput),
    ).toThrow(/working renewal amount/);
  });
  it.each(["2027-01-01", null])(
    "refuses a shared boundary or open overlapping current schedule (%s)",
    async (endDate) => {
      const h = await setup([
        { ...current, endDate },
        { ...future },
      ] as (typeof current)[]);
      expect(() => assertFutureRentSchedule(h.binding, h.inventory, h.effect)).toThrow(
        /overlaps|boundary/,
      );
    },
  );
  it("detects changed inventory and changed working terms (S156 BEH-S156-4/5)", async () => {
    const h = await setup();
    const changed = structuredClone(h.inventory);
    changed.charges[0].projection = {
      ...changed.charges[0].projection,
      amount: "1201.00",
    };
    expect(() => assertFutureRentSchedule(h.binding, changed, h.effect)).toThrow(
      /changed/,
    );
    // S156/S160 (cafa02a7): the binding stays current while the lease-bound working terms are
    // still the exact amount and dates it was prepared from. No owner approval or tenant
    // acceptance record is consulted.
    const entry = (value: number | string, revision: number) => ({
      value,
      revision,
      eventId: `event-${revision}`,
      recordedAt: "2026-09-10T12:00:00.000Z",
      recordedByUid: "staff",
      recordedByLabel: "Staff",
      origin: "staff_entry" as const,
    });
    const working: RenewalWorkingRecord = {
      schemaVersion: "renewal-working-record/v1",
      leaseId: "81",
      revision: 3,
      fields: {
        terms_rent: entry(terms.rent, 1),
        terms_effective_date: entry(terms.effectiveDate, 2),
        terms_end_date: entry(terms.endDate, 3),
      },
    };
    const noResponse = emptyRenewalWorkspace("81", h.binding.cycleId, {
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "RentVine lease end",
    });
    expect(noResponse.ownerResponse).toBeNull();
    expect(noResponse.tenantResponse).toBeNull();
    expect(
      futureRentTermsCurrent(effectiveRenewalTerms(working, noResponse), h.binding),
    ).toBe(true);
    expect(futureRentTermsCurrent(effectiveRenewalTerms(working, null), h.binding)).toBe(
      true,
    );
    const rentChanged: RenewalWorkingRecord = {
      ...working,
      fields: { ...working.fields, terms_rent: entry(1550, 4) },
    };
    expect(
      futureRentTermsCurrent(effectiveRenewalTerms(rentChanged, noResponse), h.binding),
    ).toBe(false);
    const incomplete: RenewalWorkingRecord = {
      ...working,
      fields: { terms_rent: entry(terms.rent, 1) },
    };
    expect(
      futureRentTermsCurrent(effectiveRenewalTerms(incomplete, noResponse), h.binding),
    ).toBe(false);
    // Owner-approved terms already recorded on the work record still fill a field staff have
    // not entered; the owner response is a recorded fact, not a permission.
    const approved = {
      ...noResponse,
      termsRevision: 1,
      ownerResponse: {
        eventId: "owner",
        actorUid: "staff",
        recordedAt: "2026-09-10T12:00:00.000Z",
        source: "phone",
        termsRevision: 1,
        outcome: "approved_terms" as const,
        terms,
      },
    };
    expect(futureRentTermsCurrent(effectiveRenewalTerms(null, approved), h.binding)).toBe(
      true,
    );
  });
  it("preserves the existing open-end transition refusal and requires a fresh preview after the effective date", async () => {
    const h = await setup([
      { ...current, endDate: null },
    ] as unknown as (typeof current)[]);
    expect(() =>
      assertFutureRentSchedule(h.binding, h.inventory, {
        kind: "recurring_charge_update",
        chargeId: "301",
        before: projectRecurringCharge(h.entries[0]),
        changes: { endDate: "12/31/2026" },
      }),
    ).toThrow(/open-ended/);
    expect(() =>
      assertFutureRentSchedule(
        h.binding,
        { ...h.inventory, asOfDate: "2027-01-01" },
        h.effect,
      ),
    ).toThrow(/after today/);
  });
  it("executes the existing service once, receipts its readback, and recovers a duplicate without replay", async () => {
    const h = await setup();
    let writes = 0,
      approved = true;
    const proposal = buildRenewalWritebackProposal({
      businessIntent: "future_rent",
      renewalTerms: h.binding,
      leaseId: "81",
      account: "pmikcmetro",
      actorUid: "admin",
      actorEmail: "admin@pmikcmetro.com",
      actorRole: "Admin",
      leaseState: {
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        increaseEligibilityDate: null,
      },
      sourceReadAtIso: new Date(now).toISOString(),
      evidenceRef: h.binding.scheduleReview,
      effects: [h.effect],
      nowMs: now,
    });
    const store = new MemoryExternalExecutionStore();
    const service = new RenewalWritebackService({
      descriptor: {
        environmentKind: "production",
        dataContext: "live",
        source: "explicit",
      },
      store,
      reads: h.reads,
      now: () => now,
      assertCurrentRenewalTerms: async () => approved,
      gateFor: () => ({ isExecutable: async () => true, run: async (work) => work() }),
      claimActiveEffect: async ({ record }) => {
        if (!(await store.get(record.id))) await store.create(record);
        return store.claim(record.id, record.previewHash);
      },
      createWriter: () => ({
        updateExistingRecurringCharge: async (_lease, id, body) => {
          writes++;
          Object.assign(
            h.entries.find((entry) => entry.leaseRecurringChargeID === id)!,
            body,
          );
          return { recurringCharge: { leaseRecurringChargeID: id } };
        },
        updateLease: async () => {
          throw new Error("Unexpected");
        },
        createRecurringCharge: async () => {
          throw new Error("Unexpected");
        },
        deleteRecurringChargeForCreateReversal: async () => {
          throw new Error("Unexpected");
        },
      }),
    });
    const input = {
      proposal,
      effectHash: proposal.effects[0].effectHash,
      confirmation: {
        previewHash: proposal.previewHash,
        effectHash: proposal.effects[0].effectHash,
        confirmedAtIso: new Date(now).toISOString(),
      },
      actor: { uid: "admin", role: "Admin" as const },
    };
    approved = false;
    await expect(service.executeEffect(input)).rejects.toMatchObject({
      code: "confirmation_invalid",
    });
    expect(writes).toBe(0);
    approved = true;
    const result = await service.executeEffect(input);
    expect(result.receipt).toBeTruthy();
    expect(h.entries[0].amount).toBe("1200.00");
    expect(h.entries[1].amount).toBe("1500.00");
    const duplicate = await service.executeEffect(input);
    expect(duplicate.duplicate).toBe(true);
    expect(writes).toBe(1);
  });
});
