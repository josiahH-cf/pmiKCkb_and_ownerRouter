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

// S268 R-S268-3 / AC-S268-3: both Dotloop write keys stay closed for the first packet review. The
// normal packet operation refuses loop creation and document upload at their own exact keys, makes
// no provider call and stores no attempt; a replay or an earlier uncertain creation never yields a
// second attempt. The registry here is the shipped seed itself, so the refusal is the real one.
// Isolated in-memory store and synthetic transport; no provider is reached.

const fixture = vi.hoisted(() => ({
  db: null as unknown as Firestore,
  source: null as unknown as Awaited<ReturnType<typeof resolveLivePacketInput>>,
  runtime: null as unknown as {
    client: import("@/lib/integrations/dotloop/client").DotloopClient;
  },
  registry: [] as CreateActionRegistryInput[],
  bytes: new Uint8Array([37, 80, 68, 70, 45, 83, 50, 54, 56]),
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
    listLeasePacketSnapshotIds: async () => ["s268-current-snapshot"],
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
  currentPacketHandoff,
  finishNormalPacketAction,
  linkReviewedDotloopLoop,
  prepareNormalPacketAction,
  reviewExistingDotloopLoop,
} from "@/lib/lease-renewal/execution/normal-packet-action";
import { ActionNotExecutableError } from "@/lib/operations/runtime-suspension-gate";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";

const CREATE = "dotloop.loop.create_from_template";
const UPLOAD = "dotloop.document.upload";
const actor: AuthenticatedUser = {
  uid: "s268-editor",
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
let providerCalls = 0;

/** The shipped Action Registry seed, unchanged: both Dotloop write keys are closed. */
const shippedRegistry = () => ACTION_REGISTRY_SEED.map((entry) => ({ ...entry }));
/** Only for the earlier-attempt case: what an earlier, since-closed activation allowed. */
const earlierOpenRegistry = () =>
  ACTION_REGISTRY_SEED.map((entry) =>
    entry.key.startsWith("dotloop.")
      ? {
          ...entry,
          production_allowed: true,
          readiness: "Approved for Execution" as const,
        }
      : { ...entry },
  );

const attempts = () =>
  [...fake.store.keys()].filter(
    (path) =>
      path.startsWith("lease_document_action_snapshots/") ||
      path.startsWith("action_executions/"),
  );

beforeEach(async () => {
  fake = new FakeFirestore();
  fixture.db = fake as unknown as Firestore;
  transport = createDotloopLoopFake();
  providerCalls = 0;
  const send = transport.fetch.bind(transport);
  transport.fetch = async (input) => {
    providerCalls += 1;
    return send(input);
  };
  fixture.runtime = {
    client: new DotloopClient({
      transport,
      tokens: { accessToken: async () => "s268-token", refresh: async () => null },
      sleep: async () => undefined,
    }),
  };
  fixture.registry = shippedRegistry();
  const input = readyS66Input();
  input.leaseId = "701";
  input.transactionId = "701";
  const byteHash = createHash("sha256").update(fixture.bytes).digest("hex");
  input.catalog.artifacts.forEach((artifact) => {
    artifact.contentHash = byteHash;
  });
  const evaluation = evaluateRenewalPacket(input);
  expect(evaluation.blockers).toEqual([]);
  await savePacketSnapshot(
    actor,
    { evaluation, expectedCurrentSnapshotId: null },
    fixture.db,
  );
  const workspace = emptyRenewalWorkspace("701", "11111111-1111-4111-8111-111111111268", {
    kind: "lease_bound",
    source: "Synthetic fixture",
  });
  workspace.termsRevision = 1;
  workspace.ownerResponse = {
    eventId: "22222222-2222-4222-8222-222222222268",
    actorUid: actor.uid,
    source: "Synthetic fixture",
    termsRevision: 1,
    outcome: "approved_terms",
    recordedAt: "2026-11-10T12:00:00.000Z",
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
    updated_at: "2026-11-10T12:00:00.000Z",
    profile_label: "Synthetic",
    template_label: "Synthetic",
  });
  for (const artifact of input.catalog.artifacts) {
    const id = artifact.publicationSource.reference.slice("publication:".length);
    fake.seed(`publication_versions/${id}`, {
      id,
      resourceId: `resource-${id}`,
      validated: true,
      data_mode: "live",
      spaceId: "lease-renewals",
      contentHash: byteHash,
      contentRef: { contentHash: byteHash },
      contentByteSize: fixture.bytes.length,
      fileName: "synthetic.pdf",
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
      fullName: `Synthetic Person ${index}`,
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
});

describe("AC-S268-3: both Dotloop write keys stay closed for the first packet review", () => {
  it("ships both exact keys closed", () => {
    for (const key of [CREATE, UPLOAD])
      expect(ACTION_REGISTRY_SEED.find((entry) => entry.key === key)).toMatchObject({
        production_allowed: false,
      });
  });

  it("names each operation's own closed key in the handoff readiness", async () => {
    const handoff = await currentPacketHandoff(actor, "701");
    expect(handoff.operations.create.actionKey).toBe(CREATE);
    expect(handoff.operations.upload.actionKey).toBe(UPLOAD);
    for (const [operation, key] of [
      [handoff.operations.create, CREATE],
      [handoff.operations.upload, UPLOAD],
    ] as const) {
      expect(operation.dimensions.authority).toMatchObject({
        state: "closed",
        label: "Exact-key activation remains a separate authority hold",
      });
      expect(operation.blockers).toContain(
        `The exact ${key} action is not currently executable; its S34 activation gate remains required.`,
      );
    }
    expect(providerCalls).toBe(0);
  });

  it("refuses loop creation and a replay of it with no provider call and no attempt", async () => {
    for (let replay = 0; replay < 2; replay += 1) {
      const refused = await prepareNormalPacketAction(actor, "701", "loop_create").catch(
        (error: unknown) => error,
      );
      expect(refused).toBeInstanceOf(ActionNotExecutableError);
      expect(String((refused as Error).message)).toContain(CREATE);
    }
    expect(transport.createCount).toBe(0);
    expect(providerCalls).toBe(0);
    expect(attempts()).toEqual([]);
    expect(await readLoopAssociation("701")).toBeNull();
  });

  it("refuses a document upload into a reviewed existing loop at the upload key alone", async () => {
    transport.seedLoop({
      id: "5268",
      name: "Synthetic existing loop",
      status: "PRE_OFFER",
    });
    // Reviewing and linking an existing loop is the app's own record; it is not a provider write.
    const review = await reviewExistingDotloopLoop(actor, "701", "5268");
    await linkReviewedDotloopLoop(actor, {
      leaseId: "701",
      loopId: "5268",
      expectedLinkRevision: 0,
      observationHash: review.observationHash,
      reason: "Reviewed this synthetic existing lease loop.",
      reuseAcrossCycles: false,
    });
    const before = providerCalls;
    for (let replay = 0; replay < 2; replay += 1) {
      const refused = await prepareNormalPacketAction(
        actor,
        "701",
        "document_upload",
        "fixture-document-ref-renewal_extension",
      ).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(ActionNotExecutableError);
      expect(String((refused as Error).message)).toContain(UPLOAD);
    }
    expect(providerCalls).toBe(before);
    expect(transport.uploads).toHaveLength(0);
    expect(transport.createCount).toBe(0);
    expect(attempts()).toEqual([]);
  });

  it("never turns an earlier uncertain creation into a second attempt once the key is closed", async () => {
    // An earlier activation prepared and confirmed one creation whose response was lost.
    fixture.registry = earlierOpenRegistry();
    const send = transport.fetch;
    transport.fetch = async (input) => {
      const response = await send(input);
      if (input.method === "POST" && new URL(input.url).pathname.endsWith("/loop-it"))
        throw new Error("Synthetic accepted create response was lost.");
      return response;
    };
    const preview = await prepareNormalPacketAction(actor, "701", "loop_create");
    await expect(
      finishNormalPacketAction(actor, {
        leaseId: "701",
        executionId: preview.executionId,
        previewHash: preview.previewHash,
        reason: "Reviewed this exact synthetic operation.",
      }),
    ).resolves.toMatchObject({
      execution: { state: "Needs reconciliation", attempt_count: 1 },
    });
    expect(transport.createCount).toBe(1);
    const recorded = attempts().sort();

    // The key is closed again, as shipped.
    fixture.registry = shippedRegistry();
    await expect(prepareNormalPacketAction(actor, "701", "loop_create")).rejects.toThrow(
      /unresolved|second loop/i,
    );
    const replay = await finishNormalPacketAction(actor, {
      leaseId: "701",
      executionId: preview.executionId,
      previewHash: preview.previewHash,
      reason: "Reviewed this exact synthetic operation.",
    }).catch((error: unknown) => error);
    if (!(replay instanceof Error))
      expect(replay).toMatchObject({ execution: { attempt_count: 1 } });
    expect(transport.createCount).toBe(1);
    expect(attempts().sort()).toEqual(recorded);
    expect(await readLoopAssociation("701")).toMatchObject({
      state: "creating",
      loopId: null,
      createExecutionId: preview.executionId,
    });
  });
});
