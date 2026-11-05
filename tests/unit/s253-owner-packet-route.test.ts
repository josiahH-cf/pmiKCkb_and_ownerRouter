import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPacketTruthPostHandler } from "@/app/api/lease-renewal/packet-truth/route";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  resolveLivePacketInput,
  resolveOwnerAcknowledgmentInput,
} from "@/lib/lease-documents/live-input";
import type { PacketEvaluation } from "@/lib/lease-documents/packet-types";
import { onePathCatalog, onePathEvaluationInputs } from "@/tests/fixtures/s253-one-path";

// S253 R-S253-7: the owner acknowledgment of a lease is evaluated and saved as its own packet,
// from the same resolved records as the tenant packet. The tenant packet's evaluation is untouched.
vi.mock("@/lib/lease-documents/live-input", () => ({
  resolveLivePacketInput: vi.fn(),
  resolveOwnerAcknowledgmentInput: vi.fn(),
  PACKET_SOURCE_COLLECTIONS: {
    catalog: "lease_artifact_catalogs",
    sources: "lease_document_source_mappings",
  },
}));

const editor = {
  uid: "fixture-editor",
  email: "fixture-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
const NOW = "2026-11-05T16:00:00.000Z";

function evaluate(transactionId: string, save: ReturnType<typeof vi.fn>) {
  return createPacketTruthPostHandler({
    requireCapabilityInSpace: vi.fn().mockResolvedValue(editor),
    save: save as never,
    nowIso: () => NOW,
  })(
    new Request("http://localhost/api/lease-renewal/packet-truth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "evaluate",
        leaseId: "701",
        transactionId,
        expectedCurrentSnapshotId: null,
      }),
    }),
  );
}

async function lease() {
  const { catalog } = await onePathCatalog();
  const built = onePathEvaluationInputs(catalog, {
    explanation: "SYNTHETIC explanation for the owner.",
  });
  const resolved = { input: built.tenant, inputs: built.inputs, marker: "resolved" };
  vi.mocked(resolveLivePacketInput).mockResolvedValue(resolved as never);
  vi.mocked(resolveOwnerAcknowledgmentInput).mockResolvedValue(built.owner);
  const save = vi.fn(async (_user: unknown, input: { evaluation: PacketEvaluation }) => ({
    ...input.evaluation,
    snapshotId: "saved-snapshot",
  }));
  return { built, resolved, save };
}

beforeEach(() => {
  vi.stubEnv("ENVIRONMENT_KIND", "demo");
  vi.stubEnv("DATA_CONTEXT", "demo");
  vi.mocked(resolveLivePacketInput).mockReset();
  vi.mocked(resolveOwnerAcknowledgmentInput).mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("S253 the owner acknowledgment packet route", () => {
  it("evaluates and saves the owner acknowledgment under its own identity from the lease's resolved records", async () => {
    const { resolved, save } = await lease();
    const response = await evaluate("701:owner_acknowledgment", save);
    expect(response.status).toBe(200);
    // The lease's records are resolved once, as the tenant packet's are.
    expect(resolveLivePacketInput).toHaveBeenCalledTimes(1);
    expect(resolveLivePacketInput).toHaveBeenCalledWith(editor, "701", "701", NOW);
    expect(resolveOwnerAcknowledgmentInput).toHaveBeenCalledWith(resolved, NOW);
    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0][1];
    expect(saved).toMatchObject({ expectedCurrentSnapshotId: null, nowIso: NOW });
    expect(saved.evaluation).toMatchObject({
      leaseId: "701",
      transactionId: "701:owner_acknowledgment",
      packetContext: "owner_acknowledgment",
      state: "Needs input",
    });
    expect(saved.evaluation.blockers.map((blocker) => blocker.code)).toEqual([
      "owner_ack_proof_unavailable",
    ]);
    expect(saved.evaluation.manifest?.audience).toBe("owner");
  });

  it("evaluates the tenant packet exactly as before", async () => {
    const { save } = await lease();
    const response = await evaluate("701", save);
    expect(response.status).toBe(200);
    expect(resolveLivePacketInput).toHaveBeenCalledWith(editor, "701", "701", NOW);
    expect(resolveOwnerAcknowledgmentInput).not.toHaveBeenCalled();
    expect(save.mock.calls[0][1].evaluation).toMatchObject({
      transactionId: "701",
      packetContext: "renewal_extension",
      state: "Ready for preview",
    });
  });

  it("gives another lease's owner identity to the ordinary resolver, which refuses it", async () => {
    const { save } = await lease();
    vi.mocked(resolveLivePacketInput).mockRejectedValue(
      new EditableLayerError(
        "The normal packet must belong to this exact lease workspace.",
        409,
      ),
    );
    const response = await evaluate("702:owner_acknowledgment", save);
    expect(response.status).toBe(409);
    expect(resolveLivePacketInput).toHaveBeenCalledWith(
      editor,
      "701",
      "702:owner_acknowledgment",
      NOW,
    );
    expect(resolveOwnerAcknowledgmentInput).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
