import type { Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  LEASE_RENEWAL_COLLECTIONS,
  resolutionDocId,
  resolveLeaseRenewalFlag,
} from "@/lib/firestore/lease-renewal-resolutions";
import {
  LEASE_RENEWAL_RENT_SUGGESTION_COLLECTIONS,
  approvalDocId,
  decideRentSuggestionApproval,
} from "@/lib/firestore/lease-renewal-rent-suggestion-approvals";
import {
  LEASE_RENEWAL_PROGRESS_COLLECTIONS,
  progressDocId,
} from "@/lib/firestore/lease-renewal-progress";
import {
  LEASE_RENEWAL_WRITEBACK_COLLECTIONS,
  decideWritebackApproval,
  decideWritebackApprovalsBulk,
} from "@/lib/firestore/lease-renewal-writeback-approvals";
import type { LeaseRenewalResolutionRecord } from "@/lib/firestore/types";
import {
  RENEWAL_GOVERNANCE_MATRIX,
  assertRenewalRoleAuthority,
  evaluateRenewalAuthority,
} from "@/lib/lease-renewal/role-action-governance";
import { writebackAuthorizationTokenForResolution } from "@/lib/lease-renewal/writeback-authorization-token";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import {
  getSimulationRun,
  SIMULATION_RUN_ID,
} from "@/tests/helpers/lease-renewal-simulation";

// S156-6 / S167-4: an Editor finishes the pricing-suggestion, reconciliation and source-write
// approval records alone. Verification accounts are refused at the store and the route, the
// Renewals Space guard still runs, and the Admin-only rows this program does not touch stay put.

const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  db: undefined as unknown,
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => mocks.db }));
vi.mock("@/lib/lease-renewal/resolve-run", () => ({
  createRenewalRunResolver: () => (runId: string) => getSimulationRun(runId),
}));

import { POST as resolvePost } from "@/app/api/lease-renewal/resolve/route";
import { POST as approvalsPost } from "@/app/api/lease-renewal/writeback-approvals/route";
import { POST as bulkPost } from "@/app/api/lease-renewal/writeback-approvals/bulk/route";
import {
  GET as rentSuggestionGet,
  POST as rentSuggestionPost,
} from "@/app/api/lease-renewal/rent-suggestion/route";

const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor-1@example.com",
  hd: "example.com",
  role: "Editor",
};
const canaryEditor: AuthenticatedUser = {
  uid: "canary-editor",
  email: "canary-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const canaryAdmin: AuthenticatedUser = {
  uid: "canary-admin",
  email: "canary-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

const RUN_ID = "run-1";
const KEY = "lease_renewal:reconcile:run-1:current_rent";
const LEASE_ID = "5001";

function simulationFlag(fieldKey: string) {
  const run = getSimulationRun(SIMULATION_RUN_ID)!;
  const flag = run.flags.find((entry) => entry.fieldKey === fieldKey);
  if (!flag?.queueMapping) throw new Error(`Missing simulation flag ${fieldKey}`);
  return {
    key: flag.queueMapping.queueItem.source_trigger_key,
    fingerprint: flag.candidateFingerprint,
    severity: flag.reconciliation.severity,
    candidate: flag.reconciliation.candidates[0]!.source,
  };
}

function seedResolution(db: FakeFirestore) {
  const docId = resolutionDocId(KEY);
  const record: LeaseRenewalResolutionRecord = {
    id: docId,
    source_trigger_key: KEY,
    run_id: RUN_ID,
    property_key: "opaque-property-key",
    field_key: "current_rent",
    field_label: "Current rent",
    candidate_fingerprint: `rcf1_${"1".repeat(64)}`,
    severity: "High",
    status: "Resolved",
    resolution_kind: "corrected_value",
    corrected_value: "1500.00",
    reason: "Recorded.",
    resolved_by_uid: "editor-1",
    proposed_writeback: {
      field_key: "current_rent",
      value: "1500.00",
      source_of_value: "corrected_value",
      status: "Queued",
      production_allowed: false,
    },
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
  db.seed(
    `${LEASE_RENEWAL_COLLECTIONS.resolutions}/${docId}`,
    record as unknown as Record<string, unknown>,
  );
  return writebackAuthorizationTokenForResolution(record)!;
}

function seedProgress(db: FakeFirestore) {
  const docId = progressDocId(LEASE_ID);
  db.seed(`${LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress}/${docId}`, {
    id: docId,
    lease_id: LEASE_ID,
    stage_index: 1,
    owner_decision: {
      decision: "increase",
      offered_rent: 2400,
      market: { range_low: 2200, range_high: 2500, pmi_number: 2300 },
    },
    complete: false,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  });
}

function request(path: string, body: unknown) {
  return new Request(`http://localhost/api/lease-renewal/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let db: FakeFirestore;
beforeEach(() => {
  db = new FakeFirestore();
  mocks.db = db;
});
afterEach(() => vi.clearAllMocks());

const fs = () => db as unknown as Firestore;

describe("governance rows for the removed handoffs", () => {
  it("S156-6 / S167-4: pricing suggestion, reconciliation and source-write approval are Editor rows with Editor wording", () => {
    for (const key of [
      "approve_pricing_suggestion",
      "resolve_reconciliation",
      "approve_source_write",
    ] as const) {
      const row = RENEWAL_GOVERNANCE_MATRIX[key];
      expect(row.roleCapability).toBe("edit");
      expect(row.roleDeniedReason).toMatch(/Editor access/);
      expect(`${row.roleDeniedReason} ${row.safeNextAction}`).not.toMatch(
        /Admin (authority|review)|Approver/,
      );
      expect(() => assertRenewalRoleAuthority(key, "Editor")).not.toThrow();
      expect(
        evaluateRenewalAuthority(key, {
          role: "Editor",
          managedIdentity: true,
          hasRenewalsSpace: true,
        }),
      ).toMatchObject({ code: "allowed", effectConstructable: true });
      expect(
        evaluateRenewalAuthority(key, {
          role: "Editor",
          managedIdentity: true,
          hasRenewalsSpace: false,
        }),
      ).toMatchObject({ code: "missing_space" });
    }
  });

  it("keeps every row this program does not touch at its existing stronger role", () => {
    expect(
      Object.fromEntries(
        (
          [
            "manage_renewal_configuration",
            "screenshot_rollback",
            "approve_message_template",
            "approve_filled_artifact",
            "execute_document_packet",
            "record_packet_readback",
            "execute_retired_generic_writeback",
          ] as const
        ).map((key) => [key, RENEWAL_GOVERNANCE_MATRIX[key].roleCapability]),
      ),
    ).toEqual({
      manage_renewal_configuration: "manageAdmin",
      screenshot_rollback: "manageAdmin",
      approve_message_template: "approve",
      approve_filled_artifact: "approve",
      execute_document_packet: "manageAdmin",
      record_packet_readback: "approve",
      execute_retired_generic_writeback: "manageAdmin",
    });
    expect(() =>
      assertRenewalRoleAuthority("manage_renewal_configuration", "Editor"),
    ).toThrow(EditableLayerError);
    expect(() =>
      assertRenewalRoleAuthority("execute_retired_generic_writeback", "Approver"),
    ).toThrow(EditableLayerError);
  });
});

describe("reconciliation resolutions", () => {
  it("S156-6: an Editor resolves a High flag without a reason or a second person; the fingerprint check stays", async () => {
    const high = simulationFlag("renewal_date");
    expect(high.severity).toBe("High");
    const resolution = await resolveLeaseRenewalFlag(
      editor,
      {
        run_id: SIMULATION_RUN_ID,
        source_trigger_key: high.key,
        candidate_fingerprint: high.fingerprint,
        kind: "pick_source",
        chosen_source: high.candidate,
      },
      fs(),
      getSimulationRun,
    );
    expect(resolution).toMatchObject({
      status: "Resolved",
      resolved_by_uid: "editor-1",
      reason: expect.any(String),
    });
    expect(resolution.reason?.trim()).not.toBe("");

    await expect(
      resolveLeaseRenewalFlag(
        editor,
        {
          run_id: SIMULATION_RUN_ID,
          source_trigger_key: high.key,
          candidate_fingerprint: `rcf1_${"f".repeat(64)}`,
          kind: "pick_source",
          chosen_source: high.candidate,
        },
        fs(),
        getSimulationRun,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("S167-7: a verification account cannot record a resolution", async () => {
    const medium = simulationFlag("inspections_cadence");
    for (const actor of [canaryEditor, canaryAdmin]) {
      await expect(
        resolveLeaseRenewalFlag(
          actor,
          {
            run_id: SIMULATION_RUN_ID,
            source_trigger_key: medium.key,
            candidate_fingerprint: medium.fingerprint,
            kind: "pick_source",
            chosen_source: medium.candidate,
            reason_code: "accepted_suggestion",
          },
          fs(),
          getSimulationRun,
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
    expect(db.store.size).toBe(0);
  });

  it("the resolve route admits an Editor through the Renewals Space guard and refuses a verification account", async () => {
    const medium = simulationFlag("inspections_cadence");
    const body = {
      run_id: SIMULATION_RUN_ID,
      source_trigger_key: medium.key,
      candidate_fingerprint: medium.fingerprint,
      kind: "pick_source",
      chosen_source: medium.candidate,
    };
    mocks.requireCapabilityInSpace.mockResolvedValue(editor);
    const admitted = await resolvePost(request("resolve", body));
    expect(admitted.status).toBe(200);
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("read", "renewals");

    mocks.requireCapabilityInSpace.mockResolvedValue(canaryEditor);
    const refused = await resolvePost(request("resolve", body));
    expect(refused.status).toBe(403);
  });
});

describe("source-write approval records", () => {
  it("S167-4: an Editor records the approval alone; a verification account is refused and writes nothing", async () => {
    const token = seedResolution(db);
    const approval = await decideWritebackApproval(
      editor,
      {
        run_id: RUN_ID,
        source_trigger_key: KEY,
        authorization_token: token,
        decision: "approve",
        reason: "Checked the executed lease.",
      },
      fs(),
    );
    expect(approval).toMatchObject({
      state: "Approved",
      decided_by_uid: "editor-1",
      production_allowed: false,
      executed: false,
    });

    const before = db.store.size;
    await expect(
      decideWritebackApproval(
        canaryAdmin,
        {
          run_id: RUN_ID,
          source_trigger_key: KEY,
          authorization_token: token,
          decision: "return",
          reason: "Probe.",
        },
        fs(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      decideWritebackApprovalsBulk(
        canaryEditor,
        {
          run_id: RUN_ID,
          proposals: [{ source_trigger_key: KEY, authorization_token: token }],
          decision: "return",
          reason: "Probe.",
        },
        fs(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.store.size).toBe(before);
    expect(
      db.store.get(
        `${LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvals}/${resolutionDocId(KEY)}`,
      ),
    ).toMatchObject({ state: "Approved" });
  });

  it("the approval routes admit an Editor and refuse a verification account", async () => {
    const token = seedResolution(db);
    mocks.requireCapabilityInSpace.mockResolvedValue(editor);
    const single = await approvalsPost(
      request("writeback-approvals", {
        run_id: RUN_ID,
        source_trigger_key: KEY,
        authorization_token: token,
        decision: "approve",
        reason: "Checked.",
      }),
    );
    expect(single.status).toBe(200);
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("read", "renewals");
    const bulk = await bulkPost(
      request("writeback-approvals/bulk", {
        run_id: RUN_ID,
        proposals: [{ source_trigger_key: KEY, authorization_token: token }],
        decision: "return",
        reason: "Returned.",
      }),
    );
    expect(bulk.status).toBe(200);
    await expect(bulk.json()).resolves.toMatchObject({ decided_count: 1 });

    mocks.requireCapabilityInSpace.mockResolvedValue(canaryEditor);
    const refused = await approvalsPost(
      request("writeback-approvals", {
        run_id: RUN_ID,
        source_trigger_key: KEY,
        authorization_token: token,
        decision: "approve",
        reason: "Probe.",
      }),
    );
    expect(refused.status).toBe(403);
    const refusedBulk = await bulkPost(
      request("writeback-approvals/bulk", {
        run_id: RUN_ID,
        proposals: [{ source_trigger_key: KEY, authorization_token: token }],
        decision: "approve",
        reason: "Probe.",
      }),
    );
    expect(refusedBulk.status).toBe(403);
  });
});

describe("pricing suggestion approvals", () => {
  it("S156-6: an Editor approves the server-computed number; a verification account is refused and writes nothing", async () => {
    seedProgress(db);
    const approval = await decideRentSuggestionApproval(
      editor,
      { lease_id: LEASE_ID, decision: "approve", reason: "Comps support this." },
      2200,
      null,
      fs(),
    );
    expect(approval).toMatchObject({
      state: "Approved",
      decided_by_uid: "editor-1",
      production_allowed: false,
    });
    const path = `${LEASE_RENEWAL_RENT_SUGGESTION_COLLECTIONS.approvals}/${approvalDocId(LEASE_ID)}`;
    const stored = structuredClone(db.store.get(path));
    await expect(
      decideRentSuggestionApproval(
        canaryEditor,
        { lease_id: LEASE_ID, decision: "return", reason: "Probe." },
        2200,
        null,
        fs(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.store.get(path)).toEqual(stored);
  });

  it("the rent-suggestion route admits an Editor, reports canApprove to an Editor only, and refuses a verification account", async () => {
    seedProgress(db);
    mocks.requireCapabilityInSpace.mockResolvedValue(editor);
    const read = await rentSuggestionGet(
      new Request(
        `http://localhost/api/lease-renewal/rent-suggestion?lease_id=${LEASE_ID}`,
      ),
    );
    await expect(read.json()).resolves.toMatchObject({ canApprove: true });
    const admitted = await rentSuggestionPost(
      request("rent-suggestion", {
        lease_id: LEASE_ID,
        decision: "approve",
        reason: "Comps support this.",
      }),
    );
    expect(admitted.status).toBe(200);
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("read", "renewals");

    mocks.requireCapabilityInSpace.mockResolvedValue(canaryAdmin);
    const canaryRead = await rentSuggestionGet(
      new Request(
        `http://localhost/api/lease-renewal/rent-suggestion?lease_id=${LEASE_ID}`,
      ),
    );
    await expect(canaryRead.json()).resolves.toMatchObject({ canApprove: false });
    const refused = await rentSuggestionPost(
      request("rent-suggestion", {
        lease_id: LEASE_ID,
        decision: "return",
        reason: "Probe.",
      }),
    );
    expect(refused.status).toBe(403);
  });
});
