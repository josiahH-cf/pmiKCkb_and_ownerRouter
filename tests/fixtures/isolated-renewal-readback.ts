// Fresh-process emulator readback with a synthetic provider transport; no .env or real provider.
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getCurrentPacketSnapshot } from "@/lib/firestore/lease-document-packet-snapshots";
import { FirestoreExternalExecutionStore } from "@/lib/firestore/external-action-executions";
import { RentVineClient } from "@/lib/integrations/rentvine/client";

async function main() {
  const [projectId, leaseId, packetId, gmailExecutionId, writebackExecutionId] =
    process.argv.slice(2);
  assert.equal(projectId, "demo-pmi-isolated-renewal-journey");
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
  for (const key of [
    "GOOGLE_APPLICATION_CREDENTIALS",
    "CLOUDSDK_CONFIG",
    "GH_TOKEN",
    "GITHUB_TOKEN",
  ])
    assert.equal(process.env[key], undefined);
  const actor = {
    uid: "synthetic-journey-operator",
    email: "synthetic-journey-operator@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor" as const,
  };
  const app = initializeApp({ projectId }, `synthetic-readback-${process.pid}`);
  const db = getFirestore(app);
  try {
    const packet = await getCurrentPacketSnapshot(actor, leaseId, leaseId, db);
    assert.equal(packet?.snapshotId, packetId);
    assert.equal(packet?.leaseId, leaseId);
    const gmail = await db.collection("action_executions").doc(gmailExecutionId).get();
    const snapshot = await db
      .collection("renewal_message_draft_snapshots")
      .doc(gmailExecutionId)
      .get();
    assert.equal(gmail.get("state"), "Succeeded");
    assert.equal(snapshot.get("actorUid"), actor.uid);
    assert.equal(snapshot.get("leaseId"), leaseId);
    const writeback = await new FirestoreExternalExecutionStore(db).get(
      writebackExecutionId,
    );
    assert.equal(writeback?.state, "succeeded");
    assert.equal(writeback?.attemptCount, 1);
    assert.equal(writeback?.workflowId, `s97:${leaseId}`);
    assert.equal(writeback?.actionKey, "rentvine.lease.renewal_dates.update");
    // This is the durable synthetic provider port, never a production provider observation.
    const providerState = (
      await db
        .collection("synthetic_renewal_journey_ports")
        .doc(`rentvine-${leaseId}`)
        .get()
    ).data()!;
    assert.equal(providerState.fixtureOnly, true);
    assert.equal(providerState.syntheticAccountId, "synthetic-rentvine-account");
    const client = new RentVineClient(
      {
        baseUrl: "https://synthetic-fixture.rentvine.com/api/manager",
        apiKey: "synthetic-api-key",
        apiSecret: "synthetic-api-secret",
      },
      {
        async send(input) {
          assert.equal(input.method, "GET");
          assert.equal(
            input.url,
            `https://synthetic-fixture.rentvine.com/api/manager/leases/${leaseId}`,
          );
          const body = JSON.stringify({
            lease: {
              leaseID: leaseId,
              startDate: providerState.startDate,
              endDate: providerState.endDate,
              increaseEligibilityDate: providerState.increaseEligibilityDate,
            },
          });
          return {
            status: 200,
            headers: {},
            text: async () => body,
            json: async () => JSON.parse(body),
          };
        },
      },
    );
    const observed = await client.getLease(leaseId);
    assert.equal(observed.startDate, "2026-01-01");
    assert.equal(observed.endDate, "2027-12-31");
    console.log(
      JSON.stringify({
        kind: "fresh_process_emulator_readback",
        packetPersisted: true,
        ownGmailReceiptPersisted: true,
        writebackReceiptPersisted: true,
        simulatedProviderDatesReadBack: true,
        realProviderCalls: 0,
        fixtureOnly: true,
      }),
    );
  } finally {
    await db.terminate();
    await deleteApp(app);
  }
}
main().catch(() => {
  console.error("synthetic_fresh_process_readback_failed");
  process.exitCode = 1;
});
