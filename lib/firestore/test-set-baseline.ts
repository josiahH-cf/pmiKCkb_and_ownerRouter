// S63 frozen test-set baseline (AC-S63-2, AC-S63-3). Captured ONCE per cohort lease before any
// test work begins: the authoritative RentVine facts, the Sheet row as it then read, and a sha256
// hash over both. IMMUTABLE BY CONSTRUCTION — this module's only write is a transactional
// `create`, which the Firestore API defines as an error when the document already exists. There is
// no update, no merge, no delete, and no re-capture path; the immutability boundary sentinel
// (`tests/unit/testset-baseline-immutability-boundary.test.ts`) enforces that no refresh or
// revalidation module ever imports this store and that no replacement write can be added quietly.
//
// The baseline is one of the THREE artifacts the test set must never conflate: the frozen
// baseline (this store), the append-only evidence record (`test-set-evidence.ts`), and the live
// operational view (`live-lease-cache.ts`), which keeps refreshing independently of both.
// Baseline documents contain client data (rents, addresses, tenant names) and live only in
// Firestore — never in git, logs, or committed evidence.

import { type Firestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { canonicalJson } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

export const TEST_SET_BASELINE_COLLECTION = "renewal_test_set_baselines";

/** The authoritative RentVine facts frozen at capture time. */
export interface TestSetBaselineRentvineFacts {
  leaseId: string;
  leaseEnd: string | null;
  currentRent: number | null;
  tenantCount: number | null;
  addressLabel: string | null;
  portfolioId: string | null;
}

export interface TestSetBaseline {
  leaseId: string;
  sheetRowNumber: number;
  rentvineFacts: TestSetBaselineRentvineFacts;
  /** The Sheet row as it read at capture, keyed by the normalized Renewals-tab header keys. */
  sheetRow: Record<string, string>;
  /** sha256 over the canonical JSON of { rentvineFacts, sheetRow } — the immutability witness. */
  hash: string;
  capturedAt: string;
  capturedByUid: string;
}

export interface CaptureTestSetBaselineInput {
  leaseId: string;
  sheetRowNumber: number;
  rentvineFacts: TestSetBaselineRentvineFacts;
  sheetRow: Record<string, string>;
}

/** The hash covers exactly the two frozen sources, nothing incidental. */
export function testSetBaselineHash(input: {
  rentvineFacts: TestSetBaselineRentvineFacts;
  sheetRow: Record<string, string>;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        rentvineFacts: input.rentvineFacts as unknown as Record<string, unknown>,
        sheetRow: input.sheetRow,
      }),
    )
    .digest("hex");
}

function assertEditor(actor: AuthenticatedUser): void {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError(
      "You do not have permission to capture a test-set baseline.",
      403,
    );
  }
}

function assertReader(actor: AuthenticatedUser): void {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError(
      "You do not have permission to read test-set baselines.",
      403,
    );
  }
}

/**
 * Capture the frozen baseline for one lease. CREATE-ONLY: if a baseline already exists for the
 * lease, this throws instead of replacing it — a baseline is captured once, before any work, and
 * never again. There is deliberately no parameter that replaces a captured baseline.
 */
export async function captureTestSetBaseline(
  actor: AuthenticatedUser,
  input: CaptureTestSetBaselineInput,
  db: Firestore = getAdminFirestore(),
): Promise<TestSetBaseline> {
  assertEditor(actor);
  const leaseId = String(input.leaseId ?? "").trim();
  if (leaseId === "") {
    throw new EditableLayerError("A lease id is required to capture a baseline.", 400);
  }
  if (!Number.isInteger(input.sheetRowNumber) || input.sheetRowNumber <= 0) {
    throw new EditableLayerError("A positive Sheet row number is required.", 400);
  }

  const hash = testSetBaselineHash({
    rentvineFacts: input.rentvineFacts,
    sheetRow: input.sheetRow,
  });
  const capturedAt = new Date().toISOString();
  const ref = db.collection(TEST_SET_BASELINE_COLLECTION).doc(leaseId);

  await db.runTransaction(async (transaction) => {
    transaction.create(ref, {
      id: leaseId,
      lease_id: leaseId,
      sheet_row_number: input.sheetRowNumber,
      rentvine_facts: {
        lease_id: input.rentvineFacts.leaseId,
        lease_end: input.rentvineFacts.leaseEnd,
        current_rent: input.rentvineFacts.currentRent,
        tenant_count: input.rentvineFacts.tenantCount,
        address_label: input.rentvineFacts.addressLabel,
        portfolio_id: input.rentvineFacts.portfolioId,
      },
      sheet_row: input.sheetRow,
      hash,
      captured_at: capturedAt,
      captured_by_uid: actor.uid,
    });
  });

  return {
    leaseId,
    sheetRowNumber: input.sheetRowNumber,
    rentvineFacts: input.rentvineFacts,
    sheetRow: input.sheetRow,
    hash,
    capturedAt,
    capturedByUid: actor.uid,
  };
}

/** Read one frozen baseline. Returns null when none was captured for the lease. */
export async function getTestSetBaseline(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<TestSetBaseline | null> {
  assertReader(actor);
  const trimmed = String(leaseId ?? "").trim();
  if (trimmed === "") return null;
  const snapshot = await db.collection(TEST_SET_BASELINE_COLLECTION).doc(trimmed).get();
  if (!snapshot.exists) return null;
  return baselineFromRecord((snapshot.data() ?? {}) as Record<string, unknown>);
}

/**
 * Recompute the hash from the stored sources and compare to the stored hash. A mismatch means the
 * baseline was tampered with after capture — the exact event the test set must be able to detect.
 */
export function verifyTestSetBaselineHash(baseline: TestSetBaseline): boolean {
  return (
    testSetBaselineHash({
      rentvineFacts: baseline.rentvineFacts,
      sheetRow: baseline.sheetRow,
    }) === baseline.hash
  );
}

function baselineFromRecord(raw: Record<string, unknown>): TestSetBaseline | null {
  const leaseId = typeof raw.lease_id === "string" ? raw.lease_id : null;
  const facts =
    raw.rentvine_facts && typeof raw.rentvine_facts === "object"
      ? (raw.rentvine_facts as Record<string, unknown>)
      : null;
  const hash = typeof raw.hash === "string" ? raw.hash : null;
  if (!leaseId || !facts || !hash) return null;
  return {
    leaseId,
    sheetRowNumber: typeof raw.sheet_row_number === "number" ? raw.sheet_row_number : 0,
    rentvineFacts: {
      leaseId: typeof facts.lease_id === "string" ? facts.lease_id : leaseId,
      leaseEnd: typeof facts.lease_end === "string" ? facts.lease_end : null,
      currentRent: typeof facts.current_rent === "number" ? facts.current_rent : null,
      tenantCount: typeof facts.tenant_count === "number" ? facts.tenant_count : null,
      addressLabel: typeof facts.address_label === "string" ? facts.address_label : null,
      portfolioId: typeof facts.portfolio_id === "string" ? facts.portfolio_id : null,
    },
    sheetRow:
      raw.sheet_row && typeof raw.sheet_row === "object"
        ? Object.fromEntries(
            Object.entries(raw.sheet_row as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          )
        : {},
    hash,
    capturedAt: typeof raw.captured_at === "string" ? raw.captured_at : "",
    capturedByUid: typeof raw.captured_by_uid === "string" ? raw.captured_by_uid : "",
  };
}
