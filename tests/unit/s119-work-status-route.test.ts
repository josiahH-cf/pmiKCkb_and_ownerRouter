// S119 AC-S119-4: the staff work status route takes its actor only from the server session,
// refuses forged actor fields, unknown statuses and rejected roles, and reaches no provider.

import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  saveRenewalWorkStatus: vi.fn(),
  getRenewalWorkStatus: vi.fn(),
  listRenewalWorkStatusActivity: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});

vi.mock("@/lib/firestore/renewal-work-status", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/firestore/renewal-work-status")>();
  return {
    ...actual,
    saveRenewalWorkStatus: mocks.saveRenewalWorkStatus,
    getRenewalWorkStatus: mocks.getRenewalWorkStatus,
    listRenewalWorkStatusActivity: mocks.listRenewalWorkStatusActivity,
  };
});

import { GET, POST } from "@/app/api/lease-renewal/work-status/route";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  RENEWAL_CONTROL_INVENTORY,
  RENEWAL_GOVERNANCE_MATRIX,
  RENEWAL_ROUTE_INVENTORY,
  renewalRoleCapability,
} from "@/lib/lease-renewal/role-action-governance";

const editor = {
  uid: "op-1",
  email: "op1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
const OPERATION_ID = "0f1c8f6e-6d1c-4bd3-9d7a-000000000001";
const saved = {
  schemaVersion: "renewal-work-status/v1",
  leaseId: "701",
  revision: 1,
  status: "waiting_on_owner_response",
  recordedAt: "2026-09-16T23:10:00.000Z",
  recordedByUid: editor.uid,
  recordedByLabel: editor.email,
  cycleId: null,
  eventId: OPERATION_ID,
};

function post(body: unknown) {
  return new Request("http://localhost/api/lease-renewal/work-status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.requireCapabilityInSpace.mockResolvedValue(editor);
  mocks.saveRenewalWorkStatus.mockResolvedValue({
    record: saved,
    history: [],
    duplicate: false,
  });
  mocks.getRenewalWorkStatus.mockResolvedValue(saved);
  mocks.listRenewalWorkStatusActivity.mockResolvedValue([]);
});

afterEach(() => vi.clearAllMocks());

describe("S119 work status route", () => {
  it("AC-S119-4: saves one exact status for a Renewals-space Editor with the server-derived actor", async () => {
    const response = await POST(
      post({
        leaseId: "701",
        status: "waiting_on_owner_response",
        expectedRevision: 0,
        operationId: OPERATION_ID,
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("edit", "renewals");
    expect(mocks.saveRenewalWorkStatus).toHaveBeenCalledWith(editor, {
      leaseId: "701",
      status: "waiting_on_owner_response",
      expectedRevision: 0,
      operationId: OPERATION_ID,
    });
    await expect(response.json()).resolves.toMatchObject({
      record: saved,
      duplicate: false,
    });
  });

  it("AC-S119-4: refuses forged actor or cycle fields, unknown statuses and malformed identity without touching the store", async () => {
    for (const body of [
      {
        leaseId: "701",
        status: "waiting_on_owner_response",
        expectedRevision: 0,
        operationId: OPERATION_ID,
        recordedByUid: "someone-else",
      },
      {
        leaseId: "701",
        status: "waiting_on_owner_response",
        expectedRevision: 0,
        operationId: OPERATION_ID,
        cycleId: "cycle-forged",
      },
      {
        leaseId: "701",
        status: "messaged_tenants",
        expectedRevision: 0,
        operationId: OPERATION_ID,
      },
      {
        leaseId: "lease-701",
        status: "verifying_lease_and_rent",
        expectedRevision: 0,
        operationId: OPERATION_ID,
      },
      {
        leaseId: "701",
        status: "verifying_lease_and_rent",
        expectedRevision: -1,
        operationId: OPERATION_ID,
      },
      {
        leaseId: "701",
        status: "verifying_lease_and_rent",
        expectedRevision: 0,
        operationId: "not-a-uuid",
      },
    ]) {
      const response = await POST(post(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(mocks.saveRenewalWorkStatus).not.toHaveBeenCalled();
  });

  it("AC-S119-4: refuses a role or Space the session guard rejects and surfaces a stale-save conflict as the store states it", async () => {
    mocks.requireCapabilityInSpace.mockRejectedValueOnce(
      new EditableLayerError("Renewals Space access is required.", 403),
    );
    const forbidden = await POST(
      post({
        leaseId: "701",
        status: "waiting_on_owner_response",
        expectedRevision: 0,
        operationId: OPERATION_ID,
      }),
    );
    expect(forbidden.status).toBe(403);
    expect(mocks.saveRenewalWorkStatus).not.toHaveBeenCalled();

    mocks.saveRenewalWorkStatus.mockRejectedValueOnce(
      new EditableLayerError("Another operator saved this status.", 409),
    );
    const conflict = await POST(
      post({
        leaseId: "701",
        status: "waiting_on_owner_response",
        expectedRevision: 0,
        operationId: OPERATION_ID,
      }),
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: expect.stringMatching(/Another operator saved/),
    });
  });

  it("AC-S119-4: reads back the saved status and history for readers and refuses an unknown lease id", async () => {
    const response = await GET(
      new Request("http://localhost/api/lease-renewal/work-status?leaseId=701"),
    );
    expect(response.status).toBe(200);
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("read", "renewals");
    await expect(response.json()).resolves.toEqual({ record: saved, history: [] });
    const malformed = await GET(
      new Request("http://localhost/api/lease-renewal/work-status?leaseId=abc"),
    );
    expect(malformed.status).toBe(400);
  });

  it("AC-S119-2: is governed as an ordinary app-owned write with no action key, no provider module and no workspace action", () => {
    expect(renewalRoleCapability("save_work_status")).toBe("edit");
    expect(RENEWAL_GOVERNANCE_MATRIX.save_work_status).toMatchObject({
      effect: "app_owned_write",
      externalRequirement: "none",
      actionKeys: [],
      exactConfirmation: false,
      audit: "app_activity",
    });
    expect(RENEWAL_ROUTE_INVENTORY).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "api",
          source: "app/api/lease-renewal/work-status/route.ts",
          method: "GET",
          capability: "read_workspace",
        }),
        expect.objectContaining({
          kind: "api",
          source: "app/api/lease-renewal/work-status/route.ts",
          method: "POST",
          capability: "save_work_status",
        }),
      ]),
    );
    expect(RENEWAL_CONTROL_INVENTORY).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "components/lease-renewal/RenewalWorkStatusControl.tsx",
          capability: "save_work_status",
          enforcementSources: ["app/api/lease-renewal/work-status/route.ts"],
        }),
      ]),
    );
    const route = readFileSync("app/api/lease-renewal/work-status/route.ts", "utf8");
    expect(route).toContain('renewalRoleCapability("save_work_status")');
    expect(route).toContain('renewalRoleCapability("read_workspace")');
    expect(route).not.toMatch(
      /integrations\/(rentvine|rentcast|gmail|dotloop)|sheet-writeback|saveRenewalWorkspace|startRenewalCycle|planRenewalWorkspaceAction/,
    );
    const store = readFileSync("lib/firestore/renewal-work-status.ts", "utf8");
    expect(store).not.toMatch(
      /planRenewalWorkspaceAction|startRenewalCycle|emptyRenewalWorkspace|integrations\//,
    );
    const control = readFileSync(
      "components/lease-renewal/RenewalWorkStatusControl.tsx",
      "utf8",
    );
    expect(control.match(/fetch\(\s*["'`]([^"'`]+)/g) ?? []).toEqual(
      expect.arrayContaining([expect.stringContaining("/api/lease-renewal/work-status")]),
    );
    expect(control).not.toMatch(
      /api\/lease-renewal\/(workspace|renewal-progress|operating-sheet|rentvine-writeback)/,
    );
  });
});
