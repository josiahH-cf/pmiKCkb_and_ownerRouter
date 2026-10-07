// S182 AC-S182-2 (fail-first): a colleague continues a lease's packet preview whatever happened to
// the first preparer's request. The preview's S20 execution record and its companion snapshot (the
// immutable action kept for recovery) are written in one transaction through the real S20 bridge
// and ledger, so a request that stops after the ledger write leaves no half-prepared action, and
// the colleague receives the same exact preparation instead of a misleading conflict. Only the
// packet sources, connection readiness and the closed Registry keys are fixtures here.

import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const LEASE = "701";
const PAYLOAD = "a".repeat(64);
const fixture = vi.hoisted(() => ({
  db: null as unknown as Firestore,
  registry: [] as unknown[],
  stopAfterLedger: false,
}));

vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => fixture.db }));
vi.mock("@/lib/environment/descriptor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/environment/descriptor")>()),
  assertMutationAllowed: () => undefined,
  requireEnvironmentDescriptor: () => ({}),
}));
vi.mock("@/lib/operations/runtime-suspension-gate", () => ({
  assertProductionRuntimeActionExecutable: async () => undefined,
}));
vi.mock("@/lib/lease-documents/live-input", () => ({
  resolveLivePacketInput: async () => ({
    workspace: {
      cycleId: "cycle-1",
      termsRevision: 1,
      ownerResponse: {
        outcome: "approved_terms",
        recordedAt: "2026-10-06T12:00:00.000Z",
      },
    },
    ownerApproval: "current",
    input: { catalog: { catalogVersion: "catalog-1", artifacts: [] } },
    contacts: [
      {
        participantRef: "participant-1",
        fullName: "Tenant Of Record",
        email: "tenant@example.test",
        role: "TENANT",
      },
    ],
    inputs: { facts: {} },
    catalogRecordHash: "c".repeat(64),
    mappingRecordHash: "d".repeat(64),
    packetInputsRecordHash: "e".repeat(64),
    chargePolicyRecordHash: "f".repeat(64),
    workingRecordHash: "1".repeat(64),
    leaseSourceHash: "2".repeat(64),
  }),
}));
vi.mock("@/lib/firestore/lease-document-packet-snapshots", () => ({
  getCurrentPacketSnapshot: async () => ({
    snapshotId: "packet_fixture_1",
    snapshotVersion: 1,
    leaseId: LEASE,
    transactionId: LEASE,
    payloadHash: PAYLOAD,
    state: "Ready for preview",
    manifest: { includedArtifacts: [], fields: [], participants: [] },
  }),
  getPacketHead: async () => ({
    leaseId: LEASE,
    transactionId: LEASE,
    snapshotId: "packet_fixture_1",
    snapshotVersion: 1,
    payloadHash: PAYLOAD,
  }),
}));
vi.mock("@/lib/firestore/dotloop-renewal-settings", () => ({
  getDotloopRenewalSettings: async () => ({
    profileId: "profile-1",
    templateId: "template-1",
    transactionType: "LEASE_OFFER",
    initialStatus: "PRE_OFFER",
  }),
}));
vi.mock("@/lib/connections/dotloop-runtime", () => ({
  readDotloopRuntimeReadiness: async () => ({ state: "connected", reasons: [] }),
  createDotloopRuntime: () => null,
}));
vi.mock("@/lib/firestore/lease-document-loop-association", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/firestore/lease-document-loop-association")
  >()),
  readLoopAssociation: async () => null,
}));
vi.mock("@/lib/lease-documents/evaluate-packet", () => ({
  evaluateRenewalPacket: () => ({ payloadHash: PAYLOAD }),
}));
vi.mock("@/lib/lease-documents/dotloop-packet-binding", () => ({
  bindCurrentPacketForDotloop: () => ({
    templateRef: "template-1",
    participantRefs: ["participant-1"],
    packetSnapshotHash: PAYLOAD,
    documents: [],
    catalogVersion: "catalog-1",
  }),
}));
vi.mock("@/lib/lease-documents/derived-packet-binding", () => ({
  bindApprovedDerivedPacket: async (_actor: unknown, binding: unknown) => binding,
}));
// The real bridge and ledger, given the test Firestore and a Registry copy in which the two
// Dotloop keys are open (the bridge's documented test-only seam). A preparer's request can be
// made to stop right after the ledger write returns.
vi.mock("@/lib/external-execution/s20-bridge", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/external-execution/s20-bridge")>();
  return {
    ...actual,
    prepareExternalActionWithS20: async (
      ...[actor, request]: Parameters<typeof actual.prepareExternalActionWithS20>
    ) => {
      const prepared = await actual.prepareExternalActionWithS20(actor, request, {
        db: fixture.db,
        registry: fixture.registry as CreateActionRegistryInput[],
      });
      if (fixture.stopAfterLedger) {
        fixture.stopAfterLedger = false;
        throw new Error("The request stopped after the ledger write.");
      }
      return prepared;
    },
  };
});

import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  PACKET_ACTION_SNAPSHOTS,
  prepareNormalPacketAction,
} from "@/lib/lease-renewal/execution/normal-packet-action";

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

let fake: FakeFirestore;

function paths(prefix: string) {
  return [...fake.store.keys()].filter((path) => path.startsWith(`${prefix}/`));
}

beforeEach(() => {
  fake = new FakeFirestore();
  fixture.db = fake as unknown as Firestore;
  fixture.stopAfterLedger = false;
  fixture.registry = ACTION_REGISTRY_SEED.map((entry) =>
    entry.key.startsWith("dotloop.")
      ? { ...entry, production_allowed: true, readiness: "Approved for Execution" }
      : entry,
  );
});

describe("S182 a colleague continues a packet preview", () => {
  it("after the first preparer's request stopped right after the ledger write", async () => {
    fixture.stopAfterLedger = true;
    await expect(
      prepareNormalPacketAction(preparer, LEASE, "loop_create"),
    ).rejects.toThrow("The request stopped after the ledger write.");
    const continued = await prepareNormalPacketAction(colleague, LEASE, "loop_create");
    expect(continued).toMatchObject({
      actionKey: "dotloop.loop.create_from_template",
      state: "Awaiting Admin",
    });
    // One exact preparation: one execution record, kept with its companion snapshot.
    expect(paths("action_executions")).toEqual([
      `action_executions/${continued.executionId}`,
    ]);
    expect(paths(PACKET_ACTION_SNAPSHOTS)).toEqual([
      `${PACKET_ACTION_SNAPSHOTS}/${continued.executionId}`,
    ]);
    const execution = fake.store.get(`action_executions/${continued.executionId}`)!;
    expect(execution.actor_uid).toBe(preparer.uid);
    expect(
      fake.store.get(`${PACKET_ACTION_SNAPSHOTS}/${continued.executionId}`),
    ).toMatchObject({
      leaseId: LEASE,
      operation: "loop_create",
      previewHash: execution.preview_hash,
      contextHash: execution.context_hash,
    });
  });

  it("while the first preparation is in flight or already complete", async () => {
    const first = await prepareNormalPacketAction(preparer, LEASE, "loop_create");
    const second = await prepareNormalPacketAction(colleague, LEASE, "loop_create");
    expect(second.executionId).toBe(first.executionId);
    expect(second.previewHash).toBe(first.previewHash);
    expect(paths("action_executions")).toHaveLength(1);
    expect(paths(PACKET_ACTION_SNAPSHOTS)).toHaveLength(1);
  });
});
