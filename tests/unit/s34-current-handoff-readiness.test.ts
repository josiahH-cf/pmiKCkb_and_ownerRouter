import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import { readyS66Input } from "@/tests/fixtures/s66-packet";
import type {
  PacketEvaluation,
  PacketHead,
  RenewalPacketSnapshot,
} from "@/lib/lease-documents/packet-types";
type PacketSource = Awaited<
  ReturnType<typeof import("@/lib/lease-documents/live-input").resolveLivePacketInput>
>;

const fixture = vi.hoisted(() => ({
  db: null as unknown as Firestore,
  source: null as PacketSource | null,
  snapshot: null as RenewalPacketSnapshot | null,
  head: null as PacketHead | null,
  association: null as unknown as
    | import("@/lib/lease-documents/dotloop-loop-association").LoopAssociation
    | null,
  settings: null as unknown as Awaited<
    ReturnType<
      typeof import("@/lib/firestore/dotloop-renewal-settings").getDotloopRenewalSettings
    >
  >,
  evaluation: null as PacketEvaluation | null,
  createGate: "closed",
  uploadGate: "closed",
  provider: vi.fn(),
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => fixture.db }));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityInSpace: async () => actor }));
vi.mock("@/lib/lease-documents/live-input", () => ({
  resolveLivePacketInput: async () => fixture.source,
}));
vi.mock("@/lib/firestore/lease-document-packet-snapshots", () => ({
  getCurrentPacketSnapshot: async () => fixture.snapshot,
  getPacketHead: async () => fixture.head,
}));
vi.mock("@/lib/firestore/dotloop-renewal-settings", () => ({
  getDotloopRenewalSettings: async () => fixture.settings,
}));
vi.mock("@/lib/connections/dotloop-runtime", () => ({
  readDotloopRuntimeReadiness: async () => ({ state: "connected", reasons: [] }),
  createDotloopRuntime: fixture.provider,
}));
vi.mock("@/lib/firestore/lease-document-loop-association", async (original) => ({
  ...(await original<typeof import("@/lib/firestore/lease-document-loop-association")>()),
  readLoopAssociation: async () => fixture.association,
}));
vi.mock("@/lib/lease-documents/evaluate-packet", () => ({
  evaluateRenewalPacket: () => fixture.evaluation,
}));
vi.mock("@/lib/operations/runtime-suspension-gate", async (original) => {
  const actual =
    await original<typeof import("@/lib/operations/runtime-suspension-gate")>();
  return {
    ...actual,
    assertProductionRuntimeActionExecutable: async (key: string) => {
      const state = key.endsWith("upload") ? fixture.uploadGate : fixture.createGate;
      if (state === "closed") throw new actual.ActionNotExecutableError(key);
      if (state === "suspended") throw new actual.ActionRuntimeSuspendedError(key);
      if (state === "unavailable") throw new Error("fixture unavailable");
    },
  };
});
import { currentPacketHandoff } from "@/lib/lease-renewal/execution/normal-packet-action";
import { GET } from "@/app/api/lease-renewal/document-handoff/route";

const actor: AuthenticatedUser = {
  uid: "fixture-staff",
  email: "renewals@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
beforeEach(async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/lease-documents/evaluate-packet")
  >("@/lib/lease-documents/evaluate-packet");
  fixture.db = new FakeFirestore() as unknown as Firestore;
  fixture.source = {
    notices: [],
    ownerApproval: "current",
    leaseSourceHash: "source-1",
    workspace: { cycleId: "cycle-1", ownerResponse: { outcome: "approved_terms" } },
    input: { catalog: { catalogVersion: "catalog-1", artifacts: [] } },
    inputs: { facts: {} },
    contacts: [],
    sources: { contacts: [] },
  } as unknown as PacketSource;
  fixture.snapshot = null;
  fixture.head = null;
  fixture.association = null;
  fixture.settings = {
    profileId: "profile-1",
    templateId: "template-1",
    transactionType: "LEASE_OFFER",
    initialStatus: "PRE_OFFER",
  } as NonNullable<typeof fixture.settings>;
  fixture.evaluation = actual.evaluateRenewalPacket(readyS66Input());
  fixture.createGate = "closed";
  fixture.uploadGate = "closed";
  fixture.provider.mockClear();
});

describe("S34 current handoff separates evidence and exact authority", () => {
  it("shows closed keys as authority holds while a missing packet is a separate content hold", async () => {
    const result = await currentPacketHandoff(actor, "701");
    expect(result.operations.create).toMatchObject({
      dimensions: {
        technical: { state: "supported" },
        connection: { state: "ready" },
        content: { state: "blocked" },
        authority: { state: "closed" },
      },
    });
    expect(result.blockers.join(" ")).toMatch(/evaluate.*current packet/i);
    expect(result.readiness.state).toBe("connected");
    expect(fixture.provider).not.toHaveBeenCalled();
    expect((fixture.db as unknown as FakeFirestore).store.size).toBe(0);
  });

  it("keeps suspension and unreadable authority separate from an activation request", async () => {
    fixture.createGate = "suspended";
    fixture.uploadGate = "unavailable";
    const result = await currentPacketHandoff(actor, "701");
    expect(result.operations.create).toMatchObject({
      dimensions: { authority: { state: "suspended" } },
    });
    expect(result.operations.upload).toMatchObject({
      dimensions: { authority: { state: "unavailable" } },
    });
    expect(result.operations.create.blockers.join(" ")).toMatch(/runtime suspension/i);
    expect(result.operations.upload.blockers.join(" ")).not.toMatch(
      /activation gate remains required/i,
    );
  });

  it("names changed source and withdrawn current approval without changing saved evidence", async () => {
    fixture.snapshot = {
      snapshotId: "saved-1",
      payloadHash: "b".repeat(64),
      manifest: { includedArtifacts: [], participants: [] },
    } as unknown as RenewalPacketSnapshot;
    fixture.source!.ownerApproval = "terms_changed";
    const result = await currentPacketHandoff(actor, "701");
    expect(result.blockers.join(" ")).toMatch(/sources.*changed/i);
    expect(result.blockers.join(" ")).toMatch(/owner.*approval.*current Working terms/i);
    expect(result.snapshot?.snapshotId).toBe("saved-1");
    expect((fixture.db as unknown as FakeFirestore).store.size).toBe(0);
  });

  it("does not require the create key for a linked existing-loop upload and detects a wrong-profile target", async () => {
    fixture.uploadGate = "open";
    fixture.association = {
      state: "current",
      origin: "linked_existing",
      leaseId: "701",
      loopId: "5001",
      profileId: "profile-1",
      cycleId: "cycle-1",
      linkRevision: 1,
      documents: [],
      pendingUploads: [],
    } as unknown as NonNullable<typeof fixture.association>;
    const result = await currentPacketHandoff(actor, "701");
    expect(result.operations.upload).toMatchObject({
      dimensions: { target: { state: "ready" }, authority: { state: "executable" } },
    });
    expect(result.operations.upload.blockers.join(" ")).not.toContain(
      "dotloop.loop.create_from_template",
    );
    fixture.association = { ...fixture.association, profileId: "other-profile" };
    const wrongProfile = await currentPacketHandoff(actor, "701");
    expect(wrongProfile.operations.upload).toMatchObject({
      dimensions: { target: { state: "blocked" } },
    });
    expect(wrongProfile.operations.upload.blockers.join(" ")).toMatch(
      /different Dotloop profile/i,
    );
  });
  it("returns those current holds through the actual read-only no-store route", async () => {
    const response = await GET(
      new Request("http://isolated.test/api/lease-renewal/document-handoff?leaseId=701"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      operations: {
        create: {
          dimensions: { authority: { state: "closed" }, content: { state: "blocked" } },
        },
      },
    });
    expect(fixture.provider).not.toHaveBeenCalled();
    expect((fixture.db as unknown as FakeFirestore).store.size).toBe(0);
  });
});
