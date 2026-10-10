import { describe, it, expect } from "vitest";
import {
  FinancialEntryInputSchema,
  financialProjection,
  validateFinancialAllocation,
  rawSourceAvailability,
  CaseAssociationInputSchema,
} from "@/lib/maintenance/case-model";
import type { FinancialEntry, FinancialKind } from "@/lib/maintenance/case-model";
const entry = (
  kind: FinancialKind,
  amountCents: number,
  extra: Partial<FinancialEntry> = {},
): FinancialEntry => ({
  id: "10000000-0000-4000-8000-000000000001",
  version: 1,
  ticket_id: "case-one",
  kind,
  amountCents,
  currency: "USD",
  serviceDate: "2026-10-09",
  invoiceDate: null,
  paymentDate: null,
  vendorId: "vendor-one",
  sourceRef: "fixture-source:one",
  externalIdentity: "invoice-one",
  sourceTotalCents: amountCents,
  sourceLines: [{ description: "Actual fixture work", amountCents }],
  reviewState: "reviewed",
  correctionReason: "Reviewed fixture work",
  recorded_by_uid: "staff-one",
  recorded_at: "2026-10-09T12:00:00Z",
  ...extra,
});
describe("S209/S213 durable facts retain their precise meaning", () => {
  it("does not turn estimates, invoices or staff payment claims into cost, owner charge or verified payment", () => {
    const p = financialProjection([
      entry("estimate", 50000),
      entry("vendor_invoice", 45000),
      entry("payment_claim", 10000),
    ]);
    expect(p).toMatchObject({
      estimateCents: 50000,
      invoicedCents: 45000,
      reviewedVendorCostCents: null,
      ownerChargeCents: null,
      verifiedPaidCents: null,
      paymentState: "unknown",
      balanceCents: null,
    });
  });
  it("keeps credits, markup, owner charge and source-shaped partial payment distinct and never sums currencies", () => {
    const p = financialProjection([
      entry("reviewed_vendor_cost", 40000),
      entry("pmi_markup", 4000),
      entry("owner_charge", 44000),
      entry("payment_observation", 10000, {
        paymentDate: "2026-10-08",
        verification: {
          kind: "provider_readback",
          provider: "fixture-deterministic",
          reference: "payment-one",
          resultHash: "a".repeat(64),
          observedAt: "2026-10-09T12:00:00Z",
        },
      }),
      entry("vendor_credit", 5000),
      entry("owner_charge", 1000, { currency: "EUR" }),
    ]);
    expect(p).toMatchObject({
      reviewedVendorCostCents: 40000,
      markupCents: 4000,
      creditsCents: 5000,
      ownerChargeCents: 44000,
      verifiedPaidCents: 10000,
      balanceCents: 34000,
      paymentState: "partial",
      excludedCurrencies: ["EUR"],
    });
  });
  it("incomplete or corrupt retained payment evidence cannot establish verified paid or a balance", () => {
    const observed = entry("payment_observation", 10000, {
      paymentDate: "2026-10-08",
      verification: {
        kind: "provider_readback",
        provider: "fixture-provider",
        reference: "original-payment-reference",
        resultHash: "a".repeat(64),
        observedAt: "2026-10-09T12:00:00Z",
      },
    });
    for (const incomplete of [
      { ...observed, paymentDate: null },
      { ...observed, paymentDate: "2026-02-30" },
      { ...observed, amountCents: -1 },
      { ...observed, amountCents: 1.5 },
      { ...observed, sourceRef: "" },
      ...[
        { provider: "" },
        { reference: " " },
        { resultHash: "not-a-readback-hash" },
        { observedAt: "yesterday" },
      ].map((v) => ({ ...observed, verification: { ...observed.verification!, ...v } })),
    ]) {
      expect(
        financialProjection([entry("owner_charge", 44000), incomplete]),
      ).toMatchObject({
        verifiedPaidCents: null,
        balanceCents: null,
        paymentState: "unknown",
      });
    }
    expect(financialProjection([observed])).toMatchObject({
      verifiedPaidCents: 10000,
      paymentState: "observed_unallocated",
    });
  });
  it("refuses forged payment verification, unknown zero and incompatible invoice lines", () => {
    expect(
      FinancialEntryInputSchema.safeParse(entry("payment_observation", 1)).success,
    ).toBe(false);
    const base = { ...entry("vendor_invoice", 10000), expectedEntryVersion: 0 };
    for (const key of ["version", "ticket_id", "recorded_by_uid", "recorded_at"])
      delete (base as Record<string, unknown>)[key];
    expect(
      FinancialEntryInputSchema.safeParse({ ...base, amountCents: null }).success,
    ).toBe(false);
    expect(
      FinancialEntryInputSchema.safeParse({ ...base, sourceTotalCents: 9000 }).success,
    ).toBe(false);
  });
  it("allows exact partial allocations but refuses duplicate, revised-source and over-allocation before a new effect", () => {
    const existing = {
      totalCents: 10000,
      currency: "USD",
      sourceHash: "hash-one",
      allocations: { "case-one:entry-one": 6000 },
    };
    expect(
      validateFinancialAllocation(existing, {
        allocationKey: "case-two:entry-two",
        amountCents: 4000,
        totalCents: 10000,
        currency: "USD",
        sourceHash: "hash-one",
        correction: false,
      }),
    ).toBeNull();
    expect(
      validateFinancialAllocation(existing, {
        allocationKey: "case-two:entry-two",
        amountCents: 4001,
        totalCents: 10000,
        currency: "USD",
        sourceHash: "hash-one",
        correction: false,
      }),
    ).toMatch(/exceed/);
    expect(
      validateFinancialAllocation(existing, {
        allocationKey: "case-one:entry-two",
        amountCents: 1000,
        totalCents: 10000,
        currency: "USD",
        sourceHash: "hash-one",
        correction: false,
      }),
    ).toMatch(/already/);
    expect(
      validateFinancialAllocation(existing, {
        allocationKey: "case-two:entry-two",
        amountCents: 3000,
        totalCents: 12000,
        currency: "USD",
        sourceHash: "hash-two",
        correction: false,
      }),
    ).toMatch(/revised/);
  });
  it("does not infer a historical lease from current occupancy and does not expose an expired raw conversation", () => {
    expect(
      CaseAssociationInputSchema.safeParse({
        kind: "lease",
        propertyId: "91",
        unitId: "17",
        leaseId: null,
        eventDate: "2026-10-09",
        evidenceRef: "fixture-evidence",
        reason: "Actual relation",
      }).success,
    ).toBe(false);
    expect(
      rawSourceAvailability(
        { expiresAt: "2027-10-09T00:00:00Z", legalHold: false },
        "2038-10-09T00:00:00Z",
      ),
    ).toBe("expired");
    expect(
      rawSourceAvailability(
        { expiresAt: "2027-10-09T00:00:00Z", legalHold: true },
        "2038-10-09T00:00:00Z",
      ),
    ).toBe("held_current_access_required");
  });
});
