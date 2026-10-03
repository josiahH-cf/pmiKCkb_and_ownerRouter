// S164: the existing staff work status route also reads and saves the lease's notes. The actor
// comes only from the server session, a note needs no status in the request, and neither kind of
// save reaches a provider, a cycle or the workspace. Values are synthetic.

import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  saveRenewalWorkStatus: vi.fn(),
  getRenewalWorkStatus: vi.fn(),
  listRenewalWorkStatusActivity: vi.fn(),
  saveRenewalStatusNote: vi.fn(),
  listRenewalStatusNotes: vi.fn(),
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

vi.mock("@/lib/firestore/renewal-status-notes", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/firestore/renewal-status-notes")>();
  return {
    ...actual,
    saveRenewalStatusNote: mocks.saveRenewalStatusNote,
    listRenewalStatusNotes: mocks.listRenewalStatusNotes,
  };
});

import { GET, POST } from "@/app/api/lease-renewal/work-status/route";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  RENEWAL_CONTROL_INVENTORY,
  RENEWAL_GOVERNANCE_MATRIX,
  RENEWAL_ROUTE_INVENTORY,
} from "@/lib/lease-renewal/role-action-governance";

const editor = {
  uid: "op-1",
  email: "op1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
const OPERATION_ID = "0f1c8f6e-6d1c-4bd3-9d7a-000000000001";
const NOTE_ID = "3c5e7a90-1d2f-4b6a-9c8e-000000000001";
const savedNote = {
  schemaVersion: "renewal-status-note/v1",
  leaseId: "701",
  noteId: NOTE_ID,
  revision: 1,
  text: "Owner asked for a call back.",
  recordedAt: "2026-10-02T15:00:00.000Z",
  recordedByUid: editor.uid,
  recordedByLabel: editor.email,
  updatedAt: "2026-10-02T15:00:00.000Z",
  eventId: OPERATION_ID,
};
const noteBody = {
  kind: "note",
  leaseId: "701",
  noteId: NOTE_ID,
  text: "Owner asked for a call back.",
  expectedRevision: 0,
  operationId: OPERATION_ID,
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
  mocks.saveRenewalStatusNote.mockResolvedValue({
    note: savedNote,
    notes: [savedNote],
    duplicate: false,
  });
  mocks.getRenewalWorkStatus.mockResolvedValue(null);
  mocks.listRenewalWorkStatusActivity.mockResolvedValue([]);
  mocks.listRenewalStatusNotes.mockResolvedValue([savedNote]);
});

afterEach(() => vi.clearAllMocks());

describe("S164 status log route", () => {
  it("BEH-S164-3/BEH-S164-4: saves a note through the status route with the server-derived actor and no status in the request", async () => {
    const response = await POST(post(noteBody));
    expect(response.status).toBe(200);
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("edit", "renewals");
    expect(mocks.saveRenewalStatusNote).toHaveBeenCalledWith(editor, noteBody);
    expect(mocks.saveRenewalWorkStatus).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      note: savedNote,
      notes: [savedNote],
      duplicate: false,
    });
  });

  it("BEH-S164-5/BEH-S164-10: refuses a forged actor or time, a status smuggled into a note, and malformed identity, without touching either store", async () => {
    for (const body of [
      { ...noteBody, recordedByUid: "someone-else" },
      { ...noteBody, recordedByLabel: "someone@pmikcmetro.com" },
      { ...noteBody, recordedAt: "2020-01-01T00:00:00.000Z" },
      { ...noteBody, status: "complete_staff_status" },
      { ...noteBody, noteId: "not-a-uuid" },
      { ...noteBody, operationId: "not-a-uuid" },
      { ...noteBody, leaseId: "lease-701" },
      { ...noteBody, expectedRevision: -1 },
      { ...noteBody, text: 42 },
      { ...noteBody, kind: "delete" },
    ]) {
      const response = await POST(post(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(mocks.saveRenewalStatusNote).not.toHaveBeenCalled();
    expect(mocks.saveRenewalWorkStatus).not.toHaveBeenCalled();
  });

  it("BEH-S164-8/BEH-S164-9: surfaces the store's refusal of an empty note and of a conflicting retry as the store states them", async () => {
    mocks.saveRenewalStatusNote.mockRejectedValueOnce(
      new EditableLayerError("A note needs some text before it can be saved.", 400),
    );
    const empty = await POST(post({ ...noteBody, text: "   " }));
    expect(empty.status).toBe(400);
    mocks.saveRenewalStatusNote.mockRejectedValueOnce(
      new EditableLayerError("This note was saved from another place.", 409),
    );
    const conflict = await POST(post(noteBody));
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      error: expect.stringMatching(/another place/),
    });
    mocks.requireCapabilityInSpace.mockRejectedValueOnce(
      new EditableLayerError("Renewals Space access is required.", 403),
    );
    expect((await POST(post(noteBody))).status).toBe(403);
    expect(mocks.saveRenewalStatusNote).toHaveBeenCalledTimes(2);
  });

  it("BEH-S164-5/BEH-S164-12: one read returns the saved status, its history and the notes for any reader", async () => {
    const response = await GET(
      new Request("http://localhost/api/lease-renewal/work-status?leaseId=701"),
    );
    expect(response.status).toBe(200);
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("read", "renewals");
    expect(mocks.listRenewalStatusNotes).toHaveBeenCalledWith(editor, "701");
    await expect(response.json()).resolves.toEqual({
      record: null,
      history: [],
      notes: [savedNote],
    });
  });

  it("BEH-S164-11/AC-S164-3: a note is governed as the same ordinary app-owned write and the note path reaches no provider, cycle or workspace save", () => {
    expect(RENEWAL_GOVERNANCE_MATRIX.save_work_status).toMatchObject({
      roleCapability: "edit",
      effect: "app_owned_write",
      externalRequirement: "none",
      actionKeys: [],
      exactConfirmation: false,
      audit: "app_activity",
    });
    expect(
      RENEWAL_ROUTE_INVENTORY.filter(
        (entry) => entry.source === "app/api/lease-renewal/work-status/route.ts",
      ),
    ).toHaveLength(2);
    expect(RENEWAL_CONTROL_INVENTORY).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          control: "Save a status note",
          source: "components/lease-renewal/RenewalWorkStatusControl.tsx",
          capability: "save_work_status",
          enforcementSources: ["app/api/lease-renewal/work-status/route.ts"],
        }),
      ]),
    );
    const forbidden =
      /integrations\/|sheet-writeback|saveRenewalWorkspace|startRenewalCycle|ensureRenewalWorkRecord|planRenewalWorkspaceAction|saveRenewalWorkStatus|action-gate/;
    const store = readFileSync("lib/firestore/renewal-status-notes.ts", "utf8");
    expect(store).not.toMatch(forbidden);
    expect(store).toContain("isVerificationAccount");
    // No stored note is ever removed, and the note model never derives a status from note text.
    expect(store).not.toMatch(/\.delete\(|tx\.delete|\.update\(/);
    const model = readFileSync("lib/lease-renewal/work-status-notes.ts", "utf8");
    expect(model).not.toMatch(/RENEWAL_WORK_STATUSES|RENEWAL_WORK_STATUS_LABELS/);
    const route = readFileSync("app/api/lease-renewal/work-status/route.ts", "utf8");
    expect(route).not.toMatch(
      /integrations\/(rentvine|rentcast|gmail|dotloop)|sheet-writeback|saveRenewalWorkspace|startRenewalCycle|planRenewalWorkspaceAction/,
    );
  });
});
