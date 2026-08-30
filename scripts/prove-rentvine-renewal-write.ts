// S30 one-record RentVine proof runner. The secure runtime packet supplies the separately authorized
// exact lease and values outside Git. Preview is read-only while the exact key is closed. Execute and
// rollback construct the narrow writer only inside the production runtime gate; every terminal line
// contains opaque ids/hashes/state only and never a lease, value, identity, path, provider body, or
// credential.

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { requireEnvironmentDescriptor } from "../lib/environment/descriptor";
import { FirestoreExternalExecutionStore } from "../lib/firestore/external-action-executions";
import { FirestoreRentVineProofCloseoutStore } from "../lib/firestore/rentvine-proof-closeouts";
import {
  RentVineClient,
  createFetchTransport,
  type RentVineClientConfig,
} from "../lib/integrations/rentvine/client";
import {
  RentVineWriteClient,
  createRentVineWriteFetchTransport,
} from "../lib/integrations/rentvine/write-client";
import { ACTION_REGISTRY_SEED } from "../lib/integrations/action-registry-seed";
import {
  RENTVINE_PROOF_ACTION_KEY,
  rentVineProofExecutionId,
  type RentVineProofPhase,
} from "../lib/lease-renewal/rentvine-proof-contract";
import { loadRentVineProofConfirmation } from "../lib/lease-renewal/rentvine-proof-confirmation";
import { writeRentVineProofReviewPacket } from "../lib/lease-renewal/rentvine-proof-review";
import {
  formatRentVineProofCloseoutSummary,
  formatRentVineProofExecutionSummary,
  formatRentVineProofPreviewSummary,
  formatRentVineProofRefusal,
  formatRentVineProofStatusSummary,
  parseRentVineProofRunOperation,
  safeRentVineProofFailureCode,
  type RentVineProofRunOperation,
} from "../lib/lease-renewal/rentvine-proof-run-output";
import { loadRentVineProofRuntimeConfig } from "../lib/lease-renewal/rentvine-proof-runtime-config";
import { RentVineProofService } from "../lib/lease-renewal/rentvine-proof-service";
import {
  isProductionRuntimeActionExecutable,
  runProductionRuntimeGatedAction,
} from "../lib/operations/runtime-suspension-gate";

function loadLocalEnv(root: string): void {
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && match[1] && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  } catch {
    // Ambient environment remains authoritative when no local env file exists.
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Required S30 provider configuration is missing.");
  return value;
}

function rentVineConfig(): RentVineClientConfig {
  return {
    baseUrl: requiredEnv("RENTVINE_API_BASE_URL"),
    apiKey: requiredEnv("RENTVINE_API_KEY"),
    apiSecret: requiredEnv("RENTVINE_API_SECRET"),
  };
}

function liveFirestore() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }
  return getFirestore();
}

function committedProofSeedClosed(): boolean {
  const entry = ACTION_REGISTRY_SEED.find(
    (candidate) => candidate.key === RENTVINE_PROOF_ACTION_KEY,
  );
  return entry?.production_allowed === false;
}

function expectedConfirmationPhase(
  operation: RentVineProofRunOperation,
): RentVineProofPhase | null {
  if (operation === "execute") return "forward";
  if (operation === "rollback") return "rollback";
  return null;
}

async function main(): Promise<void> {
  const operation = parseRentVineProofRunOperation(process.argv[2]);
  if (!operation) {
    console.error(
      formatRentVineProofRefusal({ operation: "unknown", code: "operation_invalid" }),
    );
    process.exitCode = 1;
    return;
  }
  const root = process.cwd();
  loadLocalEnv(root);
  const runtime = loadRentVineProofRuntimeConfig({ rootDir: root });
  const db = liveFirestore();
  let readClient: RentVineClient | null = null;
  const service = new RentVineProofService({
    descriptor: requireEnvironmentDescriptor(),
    actorReader: { getUser: (uid) => getAuth().getUser(uid) },
    store: new FirestoreExternalExecutionStore(db),
    closeouts: new FirestoreRentVineProofCloseoutStore(db),
    reader: {
      getLease(leaseId) {
        readClient ??= new RentVineClient(
          rentVineConfig(),
          createFetchTransport({ timeoutMs: 30_000 }),
        );
        return readClient.getLease(leaseId);
      },
    },
    createWriter: () =>
      new RentVineWriteClient(
        rentVineConfig(),
        createRentVineWriteFetchTransport({ timeoutMs: 30_000 }),
      ),
    gate: {
      isExecutable: () => isProductionRuntimeActionExecutable(RENTVINE_PROOF_ACTION_KEY),
      run: (effect) => runProductionRuntimeGatedAction(RENTVINE_PROOF_ACTION_KEY, effect),
      isCommittedSeedClosed: committedProofSeedClosed,
    },
  });

  if (operation === "preview" || operation === "rollback-preview") {
    const phase: RentVineProofPhase = operation === "preview" ? "forward" : "rollback";
    const prepared = await service.preview(runtime, phase);
    writeRentVineProofReviewPacket({ rootDir: root, packet: prepared.reviewPacket });
    console.log(
      formatRentVineProofPreviewSummary({
        phase,
        executionId: prepared.record.id,
        previewHash: prepared.record.previewHash,
        reused: prepared.reused,
        gateExecutable: prepared.gateExecutable,
      }),
    );
    return;
  }

  if (operation === "execute" || operation === "rollback") {
    const confirmation = loadRentVineProofConfirmation({ rootDir: root });
    const expectedPhase = expectedConfirmationPhase(operation);
    if (confirmation.phase !== expectedPhase) {
      throw new Error("S30 confirmation phase does not match the selected operation.");
    }
    const result = await service.execute(runtime, confirmation);
    console.log(
      formatRentVineProofExecutionSummary({
        phase: confirmation.phase,
        executionId: confirmation.executionId,
        resultHash: result.receipt.resultHash,
        duplicate: result.duplicate,
        reconciled: result.receipt.reconciled,
      }),
    );
    return;
  }

  if (operation === "reconcile" || operation === "rollback-reconcile") {
    const phase: RentVineProofPhase = operation === "reconcile" ? "forward" : "rollback";
    const receipt = await service.reconcile(runtime, phase);
    console.log(
      formatRentVineProofExecutionSummary({
        phase,
        executionId: rentVineProofExecutionId(runtime.proofRef, phase),
        resultHash: receipt.resultHash,
        duplicate: false,
        reconciled: true,
      }),
    );
    return;
  }

  if (operation === "closeout") {
    const result = await service.closeout(runtime);
    console.log(
      formatRentVineProofCloseoutSummary({
        closeoutId: result.record.id,
        reused: result.reused,
      }),
    );
    return;
  }

  console.log(formatRentVineProofStatusSummary(await service.status(runtime)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const operation = parseRentVineProofRunOperation(process.argv[2]) ?? "unknown";
  main().catch((error) => {
    console.error(
      formatRentVineProofRefusal({
        operation,
        code: safeRentVineProofFailureCode(error),
      }),
    );
    process.exitCode = 1;
  });
}
