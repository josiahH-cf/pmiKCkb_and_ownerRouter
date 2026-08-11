import { describe, expect, it } from "vitest";

import { bindCurrentPacketForDotloop } from "@/lib/lease-documents/dotloop-packet-binding";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { planPacketRetry } from "@/lib/lease-documents/packet-execution";
import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";
import { readyS66Input } from "@/tests/fixtures/s66-packet";

function readySnapshot(): {
  input: ReturnType<typeof readyS66Input>;
  snapshot: RenewalPacketSnapshot;
} {
  const input = readyS66Input();
  const evaluation = evaluateRenewalPacket(input);
  return {
    input,
    snapshot: {
      ...evaluation,
      snapshotId: "packet-fixture",
      snapshotVersion: 1,
      actorUid: "fixture-admin",
      createdAt: "2026-08-10T15:00:00.000Z",
      previousSnapshotId: null,
      current: true,
      visibleState: "Ready for preview",
    },
  };
}

describe("S34 exact S66 packet binding", () => {
  it("binds exact artifact, participant, field, visibility, version, and hash metadata", () => {
    const { input, snapshot } = readySnapshot();
    const binding = bindCurrentPacketForDotloop({
      snapshot,
      currentHead: {
        leaseId: snapshot.leaseId,
        transactionId: snapshot.transactionId,
        snapshotId: snapshot.snapshotId,
        snapshotVersion: snapshot.snapshotVersion,
        payloadHash: snapshot.payloadHash,
      },
      catalog: input.catalog,
      confirmedPayloadHash: snapshot.payloadHash,
    });
    expect(binding).toMatchObject({
      packetSnapshotId: snapshot.snapshotId,
      packetSnapshotHash: snapshot.payloadHash,
      packetContext: "renewal_extension",
      participantRefs: [
        "fixture-dotloop-fixture-tenant-a",
        "fixture-dotloop-fixture-tenant-b",
      ],
    });
    expect(binding.documents).toEqual([
      expect.objectContaining({
        artifactId: "fixture-renewal_extension",
        artifactVersion: "fixture-v1",
        audience: "tenant",
        fieldBindings: [
          expect.objectContaining({ fieldId: "fixture-monthly-rent-field" }),
        ],
      }),
    ]);
  });

  it.each([
    ["stale current flag", { current: false }],
    ["partial state", { visibleState: "Partially executed" as const }],
    ["conflict state", { state: "Conflict" as const, visibleState: "Conflict" as const }],
  ])("refuses %s before any provider can be constructed", (_label, patch) => {
    const { input, snapshot } = readySnapshot();
    expect(() =>
      bindCurrentPacketForDotloop({
        snapshot: { ...snapshot, ...patch },
        currentHead: {
          leaseId: snapshot.leaseId,
          transactionId: snapshot.transactionId,
          snapshotId: snapshot.snapshotId,
          snapshotVersion: snapshot.snapshotVersion,
          payloadHash: snapshot.payloadHash,
        },
        catalog: input.catalog,
        confirmedPayloadHash: snapshot.payloadHash,
      }),
    ).toThrow(/complete current packet/i);
  });

  it("refuses a mismatched confirmation hash and a missing participant mapping", () => {
    const { input, snapshot } = readySnapshot();
    const head = {
      leaseId: snapshot.leaseId,
      transactionId: snapshot.transactionId,
      snapshotId: snapshot.snapshotId,
      snapshotVersion: snapshot.snapshotVersion,
      payloadHash: snapshot.payloadHash,
    };
    expect(() =>
      bindCurrentPacketForDotloop({
        snapshot,
        currentHead: head,
        catalog: input.catalog,
        confirmedPayloadHash: "f".repeat(64),
      }),
    ).toThrow(/stale/i);

    snapshot.manifest!.participants[0] = {
      ...snapshot.manifest!.participants[0],
      providerBindings: undefined,
    };
    expect(() =>
      bindCurrentPacketForDotloop({
        snapshot,
        currentHead: head,
        catalog: input.catalog,
        confirmedPayloadHash: snapshot.payloadHash,
      }),
    ).toThrow(/participant mapping/i);
  });
});

describe("S66 partial/failure retry projection", () => {
  it("reconciles a partial attempt by its existing idempotency key", () => {
    const { snapshot } = readySnapshot();
    snapshot.visibleState = "Partially executed";
    snapshot.execution = {
      idempotencyKey: "fixture-attempt",
      receiptId: "fixture-partial-receipt",
      state: "Partially executed",
    };
    expect(planPacketRetry(snapshot)).toEqual({
      action: "reconcile",
      idempotencyKey: "fixture-attempt",
    });
  });

  it("refuses an executed or superseded packet", () => {
    const { snapshot } = readySnapshot();
    expect(
      planPacketRetry({
        ...snapshot,
        visibleState: "Executed",
        execution: { idempotencyKey: "fixture-attempt", state: "Executed" },
      }),
    ).toEqual({ action: "refuse", reason: "The packet is already executed." });
    expect(
      planPacketRetry({ ...snapshot, current: false, visibleState: "Superseded" }),
    ).toEqual({
      action: "refuse",
      reason: "The packet snapshot is superseded.",
    });
  });
});
