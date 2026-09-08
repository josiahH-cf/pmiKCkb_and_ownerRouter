import { expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { FakeFirestore } from "../helpers/fake-firestore";
import {
  savePacketSnapshot,
  recordPacketExecutionProjection,
} from "@/lib/firestore/lease-document-packet-snapshots";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { readyS66Input } from "@/tests/fixtures/s66-packet";

it("retains the receipted loop and each presence-only document through packet readback", async () => {
  const db = new FakeFirestore() as unknown as Firestore;
  const actor = {
    uid: "fixture-admin",
    email: "fixture-admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin" as const,
  };
  const snapshot = await savePacketSnapshot(
    actor,
    {
      evaluation: evaluateRenewalPacket(readyS66Input()),
      expectedCurrentSnapshotId: null,
    },
    db,
  );
  const base = {
    snapshot_id: snapshot.snapshotId,
    idempotency_key: "loop-attempt",
    state: "Partially executed" as const,
    receipt_id: "loop-receipt",
  };
  await recordPacketExecutionProjection(
    actor,
    {
      ...base,
      loop_link: {
        loop_id: "1",
        profile_id: "2",
        template_id: "3",
        packet_snapshot_hash: snapshot.payloadHash,
      },
    },
    db,
  );
  for (const documentId of ["4", "5"]) {
    await recordPacketExecutionProjection(
      actor,
      {
        ...base,
        receipt_id: `document-${documentId}`,
        document_evidence: [
          {
            receiptId: `document-${documentId}`,
            providerRef: `1/2/${documentId}`,
            evidenceLevel: "presence_only",
            documentId,
            documentName: "renewal.pdf",
            submittedContentHash: "a".repeat(64),
          },
        ],
      },
      db,
    );
  }
  const readback = await recordPacketExecutionProjection(
    actor,
    { ...base, state: "Failed", error_class: "later-step-refused" },
    db,
  );
  expect(readback.execution?.loopLink?.loopId).toBe("1");
  expect(readback.execution?.documentEvidence).toHaveLength(2);
  expect(readback.execution?.documentEvidence?.[0]).toMatchObject({
    evidenceLevel: "presence_only",
    documentId: "4",
    submittedContentHash: "a".repeat(64),
  });
  expect(readback.execution?.documentEvidence?.[0]).not.toHaveProperty(
    "providerContentHash",
  );
  expect(readback.visibleState).toBe("Failed");
});
