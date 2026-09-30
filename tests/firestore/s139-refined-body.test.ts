import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import type { AuthenticatedUser } from "@/lib/auth/session";

// S139: accepted refined wording is saved with its preparation revision, survives a reload as the
// message body, is cleared by a save without it, and turns stale (blocking the final body) when the
// composition it was refined from changes. Live lease views are deterministic fixtures.

vi.mock("@/lib/lease-renewal/live-config", async (original) => {
  const actual = await original<typeof import("@/lib/lease-renewal/live-config")>();
  const { withFakeLeaseDetail } = await import("@/tests/helpers/rentvine-detail-fake");
  const reader = withFakeLeaseDetail({
    listAllLeasesExport: async () => ({
      rows: [
        {
          lease: {
            leaseID: 701,
            leaseStatusID: "2",
            endDate: "2026-12-31",
            baseRentAmount: 1000,
            noticeDate: null,
            expectedMoveOutDate: null,
            moveOutDate: null,
            tenants: [
              {
                contactID: "1701",
                name: "Emulator Tenant",
                email: "tenant@fixture-rental.net",
              },
            ],
          },
          unit: { unitID: "2701" },
          property: { streetName: "701 Emulator Avenue" },
          portfolio: {
            owners: [{ name: "Emulator Owner", email: "owner@fixture-rental.net" }],
          },
        },
      ],
      pages: 1,
      complete: true,
    }),
    listLeaseStatuses: async () => [
      {
        leaseStatusID: "2",
        name: "Emulator Active",
        primaryLeaseStatusID: "2",
        isPendingMoveOutStatus: false,
        isCompletedMoveOutStatus: false,
        isPendingMoveInStatus: false,
        isSystemStatus: true,
      },
    ],
  });
  return {
    ...actual,
    buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: reader }),
    buildLiveRenewalConfig: () => ({ ok: false, reason: "test_source_not_configured" }),
  };
});
import {
  MESSAGE_BODY_OVERRIDE_COLLECTION,
  getMessageBodyOverride,
} from "@/lib/firestore/renewal-message-body-overrides";
import {
  MESSAGE_PREPARATION_COLLECTIONS,
  saveMessagePreparation,
} from "@/lib/firestore/renewal-message-preparations";
import { startRenewalCycle } from "@/lib/firestore/renewal-workspace";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { STALE_REFINED_BODY_MESSAGE } from "@/lib/lease-renewal/refined-message";

const projectId = "pmi-kc-kb-s139-refined-body-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const basis = {
  kind: "lease_end" as const,
  dateIso: "2026-12-31",
  source: "RentVine lease end",
};
const signature = {
  name: "Editor One",
  role: "PMI KC Metro",
  phone: null,
  hours: null,
  website: null,
  source: "Emulator signed-in staff declaration",
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s139-refined-body-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  await testEnv.clearFirestore();
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
  vi.unstubAllEnvs();
});

async function save(
  current: Awaited<ReturnType<typeof currentRenewalMessage>>,
  cycleId: string,
  overrides: Record<string, unknown>,
) {
  return saveMessagePreparation(
    editor,
    {
      leaseId: "701",
      cycleId,
      channel: "tenant",
      expectedRevision: current.saved?.revision ?? 0,
      operationId: randomUUID(),
      sourceFingerprint: current.basis.sourceFingerprint,
      reviewed: true,
      inputs: { ...current.inputs, signature },
      ...overrides,
    },
    {
      sourceFingerprint: current.basis.sourceFingerprint,
      workspaceFingerprint: current.basis.workspaceFingerprint!,
    },
    db,
  );
}

describe("S139 refined wording persistence", () => {
  it("saves with its revision, reloads as the body, clears without it, and goes stale when the composition changes", async () => {
    const started = await startRenewalCycle(
      editor,
      {
        leaseId: "701",
        expectedCycleId: null,
        expectedRevision: 0,
        operationId: randomUUID(),
        basis,
        reason: "Cycle for the S139 emulator case.",
      },
      basis,
      db,
    );
    const cycleId = started.state!.cycleId as string;
    const fresh = await currentRenewalMessage(editor, "701", "tenant", db);
    await save(fresh, cycleId, {});
    const composed = await currentRenewalMessage(editor, "701", "tenant", db);
    expect(composed.bodyOverride).toBeNull();

    const refined = `${composed.composedContent.plainText.replace("Hello", "Hi")}\n\nThank you for renting with us.`;
    await save(composed, cycleId, {
      bodyOverride: { text: refined, baseHash: composed.bodyBaseHash },
    });
    const reloaded = await currentRenewalMessage(editor, "701", "tenant", db);
    expect(reloaded.bodyOverride).toMatchObject({ state: "applied", text: refined });
    expect(reloaded.content.plainText).toBe(refined);
    expect(reloaded.content.htmlBody).toContain("Thank you for renting with us.");
    expect(reloaded.content.subject).toBe(composed.content.subject);
    const stored = await getMessageBodyOverride(editor, "701", cycleId, "tenant", db);
    expect(stored?.revision).toBe(reloaded.saved?.revision);

    // The audit entry keeps hashes, never the wording itself.
    const activity = await db.collection(MESSAGE_PREPARATION_COLLECTIONS.activity).get();
    const latest = activity.docs
      .map((doc) => doc.data())
      .find((entry) => entry.previous_revision === composed.saved?.revision);
    expect(latest?.body_override).toMatchObject({ baseHash: composed.bodyBaseHash });
    expect(JSON.stringify(latest)).not.toContain("Thank you for renting with us.");

    // A save whose inputs change the composition makes the carried wording stale: kept, not used.
    await save(reloaded, cycleId, {
      inputs: {
        ...reloaded.inputs,
        signature: { ...signature, role: "Leasing Manager" },
      },
      bodyOverride: { text: refined, baseHash: composed.bodyBaseHash },
    });
    const stale = await currentRenewalMessage(editor, "701", "tenant", db);
    expect(stale.bodyOverride).toMatchObject({ state: "stale", text: refined });
    expect(stale.content.plainText).not.toContain("Thank you for renting with us.");
    expect(stale.content.missing.map((item) => item.message)).toContain(
      STALE_REFINED_BODY_MESSAGE,
    );

    // Returning to the standard wording deletes the record.
    await save(stale, cycleId, {
      inputs: { ...stale.inputs, signature: { ...signature, role: "Leasing Manager" } },
      bodyOverride: null,
    });
    const standard = await currentRenewalMessage(editor, "701", "tenant", db);
    expect(standard.bodyOverride).toBeNull();
    expect((await db.collection(MESSAGE_BODY_OVERRIDE_COLLECTION).get()).size).toBe(0);
  });
});
