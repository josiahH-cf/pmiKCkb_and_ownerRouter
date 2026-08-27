import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertApprovedCorrectionTransactionContract,
  discrepancyDispositionId,
  listRenewalDiscrepancyDispositions,
  recordRenewalDiscrepancyDisposition,
} from "@/lib/firestore/renewal-discrepancy-dispositions";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const user: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const HASH = "a".repeat(64);

function input(overrides: Record<string, unknown> = {}) {
  return {
    lease_id: "lease-42",
    sheet_row_number: 42,
    source_hash: HASH,
    field: "current_rent",
    category: "conflict" as const,
    authoritative_source: "not_determined" as const,
    proposed_correction: "Confirm like-for-like current rent before any source change.",
    reason: "The two sources use an unconfirmed business definition.",
    owner_uid: "admin-1",
    status: "waiting_on_client" as const,
    evidence_refs: ["live-read:lease-42"],
    ...overrides,
  };
}

describe("renewal discrepancy dispositions", () => {
  it("binds exact lease + Sheet row identity and appends immutable versions", async () => {
    const db = new FakeFirestore();
    const first = await recordRenewalDiscrepancyDisposition(
      user,
      input(),
      db as never,
      "2026-08-27T10:00:00.000Z",
    );
    const second = await recordRenewalDiscrepancyDisposition(
      user,
      input({ status: "proposed", authoritative_source: "client_decision" }),
      db as never,
      "2026-08-27T10:05:00.000Z",
    );

    expect(first.id).toBe(
      discrepancyDispositionId({
        leaseId: "lease-42",
        sheetRowNumber: 42,
        field: "current_rent",
      }),
    );
    expect([first.version, second.version]).toEqual([1, 2]);
    expect(first.versionId).not.toBe(second.versionId);
    expect(first.recordHash).toMatch(/^[a-f0-9]{64}$/);
    const history = await listRenewalDiscrepancyDispositions(
      user,
      "lease-42",
      db as never,
    );
    expect(history.map((entry) => entry.version)).toEqual([1, 2]);
  });

  it("keeps unknown current-rent semantics waiting on the client", async () => {
    await expect(
      recordRenewalDiscrepancyDisposition(
        user,
        input({
          status: "approved",
          authoritative_source: "rentvine",
          transaction_key: "rentvine.lease.renewal_writeback",
        }),
        new FakeFirestore() as never,
      ),
    ).rejects.toThrow(/client-approved current-rent definition/i);
  });

  it("requires an authoritative source, exact source transaction, and receipt", async () => {
    for (const overrides of [
      { status: "approved" },
      {
        status: "completed",
        authoritative_source: "operating_sheet",
        transaction_key: "google_sheets.renewal_checklist.writeback",
        current_rent_definition_ref: "client-decision:D-current-rent",
      },
    ]) {
      await expect(
        recordRenewalDiscrepancyDisposition(
          user,
          input(overrides),
          new FakeFirestore() as never,
        ),
      ).rejects.toBeInstanceOf(Error);
    }
  });

  it("refuses a mismatched or incomplete execution contract", async () => {
    const approved = await recordRenewalDiscrepancyDisposition(
      user,
      input({
        status: "approved",
        authoritative_source: "client_decision",
        transaction_key: "rentvine.lease.renewal_writeback",
        current_rent_definition_ref: "client-decision:D-current-rent",
      }),
      new FakeFirestore() as never,
    );
    expect(() =>
      assertApprovedCorrectionTransactionContract(approved, {
        dispositionId: approved.id,
        dispositionVersion: approved.version,
        dispositionHash: "b".repeat(64),
        transactionKey: "rentvine.lease.renewal_writeback",
        exactPriorValue: "prior",
        exactProposedValue: "proposed",
        rollbackValue: "prior",
        confirmationHash: "c".repeat(64),
      }),
    ).toThrow(/exact approved source transaction/i);
  });

  it("has no provider, Sheets, RentVine, or action-gate execution import", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/firestore/renewal-discrepancy-dispositions.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/google-sheets\/write-client|rentvine\/write-client/);
    expect(source).not.toMatch(/executePreparedAction|assertActionExecutable/);
  });
});
