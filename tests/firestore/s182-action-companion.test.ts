import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { EXTERNAL_ACTION_IDEMPOTENCY_PRINCIPAL } from "@/lib/external-execution/identity";
import {
  prepareActionExecutionRecord,
  type ActionExecutionCompanion,
} from "@/lib/firestore/action-executions";

// S182 AC-S182-2 against the emulator's real transactions: an execution record and its feature
// companion commit together or not at all, and two staff members preparing the same packet action
// at the same moment end with one record, one companion and the same execution, whoever won.

const projectId = "pmi-kc-kb-s182-action-companion-test";
const CONTENTION_TIMEOUT_MS = 30_000;
const COMPANIONS = "s182_fixture_action_companions";

const preparer: AuthenticatedUser = {
  email: "renewals-a@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-a",
};
const colleague: AuthenticatedUser = {
  email: "renewals-b@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-b",
};
const previewHash = hashExecutionPreview({ document: "fixture-only" });
const contextHash = "d".repeat(64);

const companion: ActionExecutionCompanion = {
  collection: COMPANIONS,
  document: ({ previewHash: boundPreview, contextHash: boundContext }) => {
    const stored = {
      preparation: "fixture-preparation",
      previewHash: boundPreview,
      contextHash: boundContext ?? null,
    };
    return { ...stored, snapshotHash: hashExecutionPreview(stored) };
  },
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s182-action-companion-${process.pid}`);
  db = getFirestore(app);
});
beforeEach(async () => testEnv.clearFirestore());
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

function prepare(actor: AuthenticatedUser, idempotencyKey: string) {
  return prepareActionExecutionRecord(
    actor,
    {
      classification: {
        actionKey: "dotloop.document.upload",
        blockers: [],
        defaultRisk: "High",
        kind: "document_write",
        requiresActionRegistry: true,
        risk: "High",
      },
      companion,
      contextHash,
      idempotencyKey,
      idempotencyPrincipal: EXTERNAL_ACTION_IDEMPOTENCY_PRINCIPAL,
      previewHash,
    },
    db,
  );
}

async function count(collection: string) {
  return (await db.collection(collection).get()).size;
}

describe("S182 an execution record and its companion commit together", () => {
  it("writes both, or on a refusal neither", async () => {
    const record = await prepare(preparer, "fixture-upload-1");
    const saved = await db.collection(COMPANIONS).doc(record.id).get();
    expect(saved.data()).toMatchObject({ previewHash, contextHash });

    // A companion that already stands alone refuses the preparation, and the transaction writes
    // no execution record or activity.
    const orphan = await prepare(preparer, "fixture-upload-2");
    await db.collection("action_executions").doc(orphan.id).delete();
    const activityBefore = await count("action_execution_activity");
    await expect(prepare(colleague, "fixture-upload-2")).rejects.toThrow(
      /no execution record/,
    );
    expect((await db.collection("action_executions").doc(orphan.id).get()).exists).toBe(
      false,
    );
    expect(await count("action_execution_activity")).toBe(activityBefore);
  });

  it(
    "gives two staff preparing at once one record, one companion and the same execution",
    async () => {
      const [first, second] = await Promise.all([
        prepare(preparer, "fixture-upload-3"),
        prepare(colleague, "fixture-upload-3"),
      ]);
      expect(second.id).toBe(first.id);
      expect(second.actor_uid).toBe(first.actor_uid);
      expect(await count("action_executions")).toBe(1);
      expect(await count(COMPANIONS)).toBe(1);
    },
    CONTENTION_TIMEOUT_MS,
  );
});
