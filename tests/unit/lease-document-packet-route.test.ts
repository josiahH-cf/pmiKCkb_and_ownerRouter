import { describe, expect, it, vi } from "vitest";

import {
  createPacketTruthGetHandler,
  createPacketTruthPostHandler,
} from "@/app/api/lease-renewal/packet-truth/route";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";
import { AuthError } from "@/lib/auth/session";
import { readyS66Input } from "@/tests/fixtures/s66-packet";

const editor = {
  uid: "fixture-editor",
  email: "fixture-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};

function snapshot(): RenewalPacketSnapshot {
  return {
    ...evaluateRenewalPacket(readyS66Input()),
    snapshotId: "packet-fixture",
    snapshotVersion: 1,
    actorUid: editor.uid,
    createdAt: "2026-08-10T12:00:00.000Z",
    previousSnapshotId: null,
    current: true,
    visibleState: "Ready for preview",
  };
}

describe("S66 packet truth route", () => {
  it("gates GET by read + renewals and returns the current snapshot", async () => {
    const requireCapabilityInSpace = vi.fn().mockResolvedValue(editor);
    const getCurrent = vi.fn().mockResolvedValue(snapshot());
    const response = await createPacketTruthGetHandler({
      requireCapabilityInSpace,
      getCurrent,
    })(
      new Request(
        "http://localhost/api/lease-renewal/packet-truth?leaseId=fixture-lease&transactionId=fixture-transaction",
      ),
    );
    expect(response.status).toBe(200);
    expect(requireCapabilityInSpace).toHaveBeenCalledWith("read", "renewals");
    expect(getCurrent).toHaveBeenCalledWith(
      editor,
      "fixture-lease",
      "fixture-transaction",
    );
  });

  it("gates POST before source resolution or persistence", async () => {
    const denied = new AuthError("denied", 403);
    const requireCapabilityInSpace = vi.fn().mockRejectedValue(denied);
    const resolveInput = vi.fn();
    const save = vi.fn();
    const response = await createPacketTruthPostHandler({
      requireCapabilityInSpace,
      resolveInput,
      save,
    })(
      new Request("http://localhost/api/lease-renewal/packet-truth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "evaluate",
          leaseId: "fixture-lease",
          transactionId: "fixture-transaction",
          expectedCurrentSnapshotId: null,
        }),
      }),
    );
    expect(response.status).toBe(403);
    expect(resolveInput).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("resolves truth server-side and saves the exact expected-current version", async () => {
    const requireCapabilityInSpace = vi.fn().mockResolvedValue(editor);
    const resolveInput = vi.fn().mockResolvedValue(readyS66Input());
    const saved = snapshot();
    const save = vi.fn().mockResolvedValue(saved);
    const response = await createPacketTruthPostHandler({
      requireCapabilityInSpace,
      resolveInput,
      save,
      nowIso: () => "2026-08-10T12:00:00.000Z",
    })(
      new Request("http://localhost/api/lease-renewal/packet-truth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "evaluate",
          leaseId: "fixture-lease",
          transactionId: "fixture-transaction",
          expectedCurrentSnapshotId: "packet-prior",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(requireCapabilityInSpace).toHaveBeenCalledWith("edit", "renewals");
    expect(resolveInput).toHaveBeenCalledWith(
      "fixture-lease",
      "fixture-transaction",
      "2026-08-10T12:00:00.000Z",
    );
    expect(save).toHaveBeenCalledWith(
      editor,
      expect.objectContaining({
        expectedCurrentSnapshotId: "packet-prior",
        evaluation: expect.objectContaining({ payloadHash: saved.payloadHash }),
      }),
    );
  });

  it("rejects client-supplied facts, participants, or artifact content", async () => {
    const requireCapabilityInSpace = vi.fn().mockResolvedValue(editor);
    const resolveInput = vi.fn();
    const save = vi.fn();
    const response = await createPacketTruthPostHandler({
      requireCapabilityInSpace,
      resolveInput,
      save,
    })(
      new Request("http://localhost/api/lease-renewal/packet-truth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "evaluate",
          leaseId: "fixture-lease",
          transactionId: "fixture-transaction",
          expectedCurrentSnapshotId: null,
          facts: [{ fieldKey: "caller-assertion" }],
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(resolveInput).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
