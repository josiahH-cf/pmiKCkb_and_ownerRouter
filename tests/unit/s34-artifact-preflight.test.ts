import { beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({
  runtime: vi.fn(() => ({ client: {} })),
  execute: vi.fn(async () => ({ execution: { state: "Prepared" } })),
}));
vi.mock("@/lib/operations/runtime-suspension-gate", () => ({
  assertProductionRuntimeActionExecutable: vi.fn(),
}));
vi.mock("@/lib/connections/dotloop-runtime", () => ({
  createDotloopRuntime: calls.runtime,
  readDotloopRuntimeReadiness: async () => ({ state: "connected" }),
}));
vi.mock("@/lib/firestore/dotloop-renewal-settings", () => ({
  getDotloopRenewalSettings: async () => ({
    profileId: "isolated-profile",
    templateId: "isolated-template",
    transactionType: "LEASE_OFFER",
    initialStatus: "PRE_OFFER",
  }),
}));
vi.mock("@/lib/lease-documents/dotloop-packet-binding", () => ({
  bindCurrentPacketForDotloop: () => ({
    templateRef: "isolated-template",
    participantRefs: ["isolated-participant"],
    packetSnapshotHash: "isolated-hash",
    documents: [{ documentRef: "isolated-document", contentHash: "a".repeat(64) }],
  }),
}));
vi.mock("@/lib/external-execution/s20-bridge", () => ({
  executeExternalActionWithS20: calls.execute,
}));
import { executeDotloopPacketWithS20 } from "@/lib/lease-renewal/execution/dotloop-runtime";

beforeEach(() => vi.clearAllMocks());

it("resolves approved artifact bytes before provider construction or an S20 execution claim", async () => {
  const artifactContent = vi
    .fn()
    .mockRejectedValue(new Error("Approved artifact unavailable"));
  await expect(
    executeDotloopPacketWithS20(
      {} as never,
      {
        participants: [
          {
            participantRef: "isolated-participant",
            email: "isolated@example.test",
            fullName: "Isolated",
            role: "TENANT",
          },
        ],
        artifactContent,
        packet: {
          snapshot: {
            execution: {
              loopLink: {
                packetSnapshotHash: "isolated-hash",
                loopId: "isolated-loop",
                profileId: "isolated-profile",
              },
            },
          },
        },
        request: {
          action: {
            actionKey: "dotloop.document.upload",
            values: {
              document_ref: "isolated-document",
              content_hash: "a".repeat(64),
              loop_ref: "isolated-loop",
            },
          },
        },
      } as never,
    ),
  ).rejects.toThrow("Approved artifact unavailable");
  expect(artifactContent).toHaveBeenCalledWith("isolated-document");
  expect(calls.runtime).not.toHaveBeenCalled();
  expect(calls.execute).not.toHaveBeenCalled();
});

it.each(["isolated-participant", "another-participant"])(
  "binds the opaque participant reference %s independently from its verified email",
  async (participantRef) => {
    const action = executeDotloopPacketWithS20(
      {} as never,
      {
        participants: [
          {
            participantRef,
            email: "isolated@example.test",
            fullName: "Isolated",
            role: "TENANT",
          },
        ],
        packet: {},
        request: {
          action: {
            actionKey: "dotloop.loop.create_from_template",
            values: {
              template_ref: "isolated-template",
              participant_refs: "isolated-participant",
            },
          },
        },
      } as never,
    );
    if (participantRef === "isolated-participant") {
      await expect(action).resolves.toMatchObject({ execution: { state: "Prepared" } });
      expect(calls.execute).toHaveBeenCalledOnce();
    } else {
      await expect(action).rejects.toThrow(
        "verified participant and template mappings do not match",
      );
      expect(calls.runtime).not.toHaveBeenCalled();
      expect(calls.execute).not.toHaveBeenCalled();
    }
  },
);
