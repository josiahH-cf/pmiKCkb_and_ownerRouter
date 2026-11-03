import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import type { PublicationVersionRecord } from "@/lib/publication/types";
import type { resolveLivePacketInput } from "@/lib/lease-documents/live-input";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import { createDotloopLoopFake } from "@/tests/helpers/dotloop-loop-fake";
import { readyS66Input } from "@/tests/fixtures/s66-packet";

// This uses the normal operation, real packet binding, S20 ledger/claim, association and typed
// provider over an isolated in-memory store/transport. Source approvals and byte storage are
// synthetic fixtures, not production/legal/provider completion evidence.
const fixture = vi.hoisted(() => ({
  db: null as unknown as Firestore,
  source: null as unknown as Awaited<ReturnType<typeof resolveLivePacketInput>>,
  runtime: null as unknown as {
    client: import("@/lib/integrations/dotloop/client").DotloopClient;
  },
  registry: [] as CreateActionRegistryInput[],
  bytes: new Uint8Array([37, 80, 68, 70, 45, 70, 73, 88, 84, 85, 82, 69]),
  failProjectionOnce: false,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => fixture.db }));
vi.mock("@/lib/environment/descriptor", async (original) => ({
  ...(await original<typeof import("@/lib/environment/descriptor")>()),
  assertMutationAllowed: () => undefined,
  requireEnvironmentDescriptor: () => ({}),
}));
vi.mock("@/lib/operations/runtime-suspension-gate", async (original) => {
  const actual =
    await original<typeof import("@/lib/operations/runtime-suspension-gate")>();
  return {
    ...actual,
    assertProductionRuntimeActionExecutable: async (key: string) => {
      if (!fixture.registry.find((entry) => entry.key === key)?.production_allowed)
        throw new actual.ActionNotExecutableError(key);
    },
  };
});
vi.mock("@/lib/lease-documents/live-input", () => ({
  resolveLivePacketInput: async () => fixture.source,
}));
vi.mock("@/lib/connections/dotloop-runtime", () => ({
  createDotloopRuntime: () => fixture.runtime,
  readDotloopRuntimeReadiness: async () => ({ state: "connected", reasons: [] }),
  refreshDotloopResourceReadiness: async () => ({
    readiness: { state: "connected", reasons: [] },
  }),
}));
vi.mock("@/lib/external-execution/s20-bridge", async (original) => {
  const actual = await original<typeof import("@/lib/external-execution/s20-bridge")>();
  return {
    ...actual,
    prepareExternalActionWithS20: (
      actor: Parameters<typeof actual.prepareExternalActionWithS20>[0],
      request: Parameters<typeof actual.prepareExternalActionWithS20>[1],
    ) =>
      actual.prepareExternalActionWithS20(actor, request, {
        db: fixture.db,
        registry: fixture.registry,
      }),
    executeExternalActionWithS20: (
      actor: Parameters<typeof actual.executeExternalActionWithS20>[0],
      request: Parameters<typeof actual.executeExternalActionWithS20>[1],
    ) =>
      actual.executeExternalActionWithS20(actor, request, {
        db: fixture.db,
        registry: fixture.registry,
        emitAttention: async () => undefined,
      }),
    reconcileExternalActionWithS20: (
      actor: Parameters<typeof actual.reconcileExternalActionWithS20>[0],
      request: Parameters<typeof actual.reconcileExternalActionWithS20>[1],
    ) =>
      actual.reconcileExternalActionWithS20(actor, request, {
        db: fixture.db,
        registry: fixture.registry,
        emitAttention: async () => undefined,
      }),
  };
});
vi.mock("@/lib/firestore/lease-document-packet-snapshots", async (original) => {
  const actual =
    await original<typeof import("@/lib/firestore/lease-document-packet-snapshots")>();
  return {
    ...actual,
    listLeasePacketSnapshotIds: async () => ["isolated-current-snapshot"],
    recordPacketExecutionProjection: async (
      ...args: Parameters<typeof actual.recordPacketExecutionProjection>
    ) => {
      if (fixture.failProjectionOnce) {
        fixture.failProjectionOnce = false;
        throw new Error("isolated projection persistence stopped");
      }
      return actual.recordPacketExecutionProjection(...args);
    },
  };
});
vi.mock("@/lib/lease-documents/approved-artifact-content", async (original) => {
  const actual =
    await original<typeof import("@/lib/lease-documents/approved-artifact-content")>();
  return {
    ...actual,
    resolveApprovedDotloopArtifact: (
      actor: Parameters<typeof actual.resolveApprovedDotloopArtifact>[0],
      input: Parameters<typeof actual.resolveApprovedDotloopArtifact>[1],
    ) =>
      actual.resolveApprovedDotloopArtifact(actor, input, {
        readPublication: async (id) =>
          (
            await fixture.db.collection("publication_versions").doc(id).get()
          ).data() as PublicationVersionRecord,
        readActiveVersionId: async (id) =>
          (await fixture.db.collection("publication_resources").doc(id).get()).get(
            "activeVersionId",
          ) ?? null,
        readContent: async () => fixture.bytes,
      }),
  };
});

import { DotloopClient } from "@/lib/integrations/dotloop/client";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { savePacketSnapshot } from "@/lib/firestore/lease-document-packet-snapshots";
import { readLoopAssociation } from "@/lib/firestore/lease-document-loop-association";
import {
  prepareNormalPacketAction,
  finishNormalPacketAction,
  reviewExistingDotloopLoop,
  linkReviewedDotloopLoop,
} from "@/lib/lease-renewal/execution/normal-packet-action";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";

const actor: AuthenticatedUser = {
  uid: "isolated-editor",
  email: "renewals@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const settings = {
  profileId: "profile-1",
  templateId: "fixture-template-renewal_extension",
  transactionType: "LEASE_OFFER",
  initialStatus: "PRE_OFFER",
};
let fake: FakeFirestore;
let transport: ReturnType<typeof createDotloopLoopFake>;

beforeEach(async () => {
  fake = new FakeFirestore();
  fixture.db = fake as unknown as Firestore;
  fixture.failProjectionOnce = false;
  transport = createDotloopLoopFake();
  fixture.runtime = {
    client: new DotloopClient({
      transport,
      tokens: { accessToken: async () => "isolated-token", refresh: async () => null },
      sleep: async () => undefined,
    }),
  };
  fixture.registry = ACTION_REGISTRY_SEED.map((entry) =>
    entry.key.startsWith("dotloop.")
      ? { ...entry, production_allowed: true, readiness: "Approved for Execution" }
      : entry,
  );
  const input = readyS66Input();
  input.leaseId = "701";
  input.transactionId = "701";
  const byteHash = createHash("sha256").update(fixture.bytes).digest("hex");
  input.catalog.artifacts.forEach((artifact) => {
    artifact.contentHash = byteHash;
  });
  const evaluation = evaluateRenewalPacket(input);
  expect(evaluation.blockers).toEqual([]);
  const snapshot = await savePacketSnapshot(
    actor,
    { evaluation, expectedCurrentSnapshotId: null },
    fixture.db,
  );
  const workspace = emptyRenewalWorkspace("701", "11111111-1111-4111-8111-111111111111", {
    kind: "lease_bound",
    source: "Isolated fixture",
  });
  workspace.termsRevision = 1;
  workspace.ownerResponse = {
    eventId: "22222222-2222-4222-8222-222222222222",
    actorUid: actor.uid,
    source: "Isolated fixture",
    termsRevision: 1,
    outcome: "approved_terms",
    recordedAt: "2026-11-03T12:00:00.000Z",
  };
  const scope = createHash("sha256").update("701").digest("hex");
  fake.seed(`lease_renewal_lease_bound_workspaces/${scope}`, { ...workspace });
  fake.seed("lease_artifact_catalogs/current", { fixture: "approved-catalog" });
  fake.seed(`lease_document_source_mappings/${scope}`, { fixture: "approved-mapping" });
  fake.seed("dotloop_renewal_settings/current", {
    profile_id: settings.profileId,
    template_id: settings.templateId,
    transaction_type: settings.transactionType,
    initial_status: settings.initialStatus,
    schema_version: 1,
    version: 1,
    updated_by_uid: actor.uid,
    updated_at: "2026-11-03T12:00:00.000Z",
    profile_label: "Isolated",
    template_label: "Isolated",
  });
  for (const artifact of input.catalog.artifacts) {
    const id = artifact.publicationSource.reference.slice("publication:".length);
    fake.seed(`publication_versions/${id}`, {
      id,
      resourceId: `resource-${id}`,
      validated: true,
      data_mode: "live",
      spaceId: "renewals",
      contentHash: byteHash,
      contentRef: { contentHash: byteHash },
      contentByteSize: fixture.bytes.length,
      fileName: "isolated.pdf",
      detectedMimeType: "application/pdf",
    });
    fake.seed(`publication_resources/resource-${id}`, { activeVersionId: id });
  }
  fixture.source = {
    workspace,
    ownerApproval: "current",
    notices: [],
    input,
    inputs: { facts: {} },
    contacts: input.participants.map((participant, index) => ({
      participantRef: participant.providerBindings!.dotloopParticipantRef,
      fullName: `Isolated Person ${index}`,
      email: `person-${index}@example.test`,
      role: participant.kind === "tenant" ? "TENANT" : "LANDLORD",
    })),
    catalogRecordHash: hashExecutionPreview({ fixture: "approved-catalog" }),
    mappingRecordHash: hashExecutionPreview({ fixture: "approved-mapping" }),
    packetInputsRecordHash: hashExecutionPreview({}),
    chargePolicyRecordHash: hashExecutionPreview({}),
    workingRecordHash: hashExecutionPreview({}),
    leaseSourceHash: "a".repeat(64),
  } as unknown as Awaited<ReturnType<typeof resolveLivePacketInput>>;
  expect(snapshot.snapshotId).toBeTruthy();
});

async function confirm(preview: Awaited<ReturnType<typeof prepareNormalPacketAction>>) {
  return finishNormalPacketAction(actor, {
    leaseId: "701",
    executionId: preview.executionId,
    previewHash: preview.previewHash,
    reason: "Reviewed this exact synthetic isolated operation.",
  });
}

describe("S34 normal packet paths through isolated owners", () => {
  it("creates once, persists its own receipt and recovers a stopped projection without another create", async () => {
    const preview = await prepareNormalPacketAction(actor, "701", "loop_create");
    fixture.failProjectionOnce = true;
    await expect(confirm(preview)).rejects.toThrow(
      "isolated projection persistence stopped",
    );
    expect(transport.createCount).toBe(1);
    const saved = fake.store.get(
      `lease_document_action_snapshots/${preview.executionId}`,
    )!;
    expect(saved.effectReceipt).toMatchObject({
      actionKey: "dotloop.loop.create_from_template",
      providerRef: "loop-1",
    });
    await expect(
      finishNormalPacketAction(actor, {
        leaseId: "701",
        executionId: preview.executionId,
        reconcile: true,
      }),
    ).resolves.toMatchObject({ execution: { state: "Succeeded", attempt_count: 1 } });
    expect(transport.createCount).toBe(1);
    expect(await readLoopAssociation("701")).toMatchObject({
      state: "current",
      origin: "app_created",
      loopId: "loop-1",
      createExecutionId: preview.executionId,
    });
  });

  it("uploads exact approved bytes into a reviewed existing loop with only the upload key, then recovers its same receipt", async () => {
    fixture.registry = fixture.registry.map((entry) =>
      entry.key === "dotloop.loop.create_from_template"
        ? { ...entry, production_allowed: false, readiness: "Needs Permission" }
        : entry,
    );
    transport.seedLoop({
      id: "5001",
      name: "Isolated pre-existing loop",
      status: "PRE_OFFER",
    });
    const review = await reviewExistingDotloopLoop(actor, "701", "5001");
    await linkReviewedDotloopLoop(actor, {
      leaseId: "701",
      loopId: "5001",
      expectedLinkRevision: 0,
      observationHash: review.observationHash,
      reason: "Reviewed this synthetic existing lease loop.",
      reuseAcrossCycles: false,
    });
    const preview = await prepareNormalPacketAction(
      actor,
      "701",
      "document_upload",
      "fixture-document-ref-renewal_extension",
    );
    expect(preview.actionKey).toBe("dotloop.document.upload");
    await expect(confirm(preview)).resolves.toMatchObject({
      execution: { state: "Succeeded", attempt_count: 1 },
    });
    expect(transport.createCount).toBe(0);
    expect(transport.uploads).toHaveLength(1);
    expect(transport.uploads[0].bytes).toEqual(fixture.bytes);
    await expect(confirm(preview)).resolves.toMatchObject({
      execution: { state: "Succeeded", attempt_count: 1 },
    });
    expect(transport.uploads).toHaveLength(1);
    expect(await readLoopAssociation("701")).toMatchObject({
      origin: "linked_existing",
      documents: [{ receiptId: preview.executionId, dotloopDocumentId: "document-1" }],
    });
  });

  it("keeps a lost create response unresolved without inferring causality or creating again", async () => {
    const send = transport.fetch.bind(transport);
    transport.fetch = async (input) => {
      const response = await send(input);
      if (input.method === "POST" && new URL(input.url).pathname.endsWith("/loop-it"))
        throw new Error("Isolated accepted create response was lost.");
      return response;
    };
    const preview = await prepareNormalPacketAction(actor, "701", "loop_create");
    await expect(confirm(preview)).resolves.toMatchObject({
      execution: { state: "Needs reconciliation", attempt_count: 1 },
    });
    expect(transport.createCount).toBe(1);
    expect(
      fake.store.get(`lease_document_action_snapshots/${preview.executionId}`),
    ).not.toHaveProperty("effectReceipt");
    await expect(
      finishNormalPacketAction(actor, {
        leaseId: "701",
        executionId: preview.executionId,
        reconcile: true,
      }),
    ).resolves.toMatchObject({
      execution: { state: "Needs reconciliation", attempt_count: 1 },
    });
    await expect(prepareNormalPacketAction(actor, "701", "loop_create")).rejects.toThrow(
      /unresolved|second loop/i,
    );
    expect(transport.createCount).toBe(1);
    expect(await readLoopAssociation("701")).toMatchObject({
      state: "creating",
      loopId: null,
      createExecutionId: preview.executionId,
    });
  });
});
