import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { DotloopClient } from "@/lib/integrations/dotloop/client";
import {
  DOTLOOP_LOOP_NAME_PREFIX,
  LiveDotloopProvider,
  dotloopLoopNameFor,
  type DotloopRenewalSelection,
} from "@/lib/integrations/dotloop/renewal-provider";
import {
  applyDotloopLoopReadback,
  decideDotloopLoopAction,
  dotloopSignatureHandoff,
  type DotloopLoopLink,
} from "@/lib/lease-documents/dotloop-loop-link";
import { createDotloopLoopFake } from "@/tests/helpers/dotloop-loop-fake";

// S34: one approved renewal packet becomes exactly one Dotloop loop. Everything here runs against
// the provider fake; the live create/readback proof is blocked on the owner's connected account.

const SELECTION: DotloopRenewalSelection = {
  profileId: "profile-1",
  templateId: "template-1",
  transactionType: "LEASE_OFFER",
  initialStatus: "PRE_OFFER",
};

const PARTICIPANTS = [
  { fullName: "Tenant Of Record", email: "tenant@example.test", role: "TENANT" as const },
  { fullName: "Owner Of Record", email: "owner@example.test", role: "LANDLORD" as const },
];

const ADDRESS = {
  streetName: "4821 Maple Ct",
  city: "Kansas City",
  state: "MO",
  zip: "64110",
};

let fake: ReturnType<typeof createDotloopLoopFake>;

function providerFor(overrides: Record<string, unknown> = {}) {
  const client = new DotloopClient({
    transport: fake,
    tokens: { accessToken: async () => "access-1", refresh: async () => null },
    sleep: async () => undefined,
  });
  return new LiveDotloopProvider({
    client,
    selection: SELECTION,
    participants: PARTICIPANTS,
    propertyAddress: ADDRESS,
    packetSnapshotId: "snapshot-1",
    ...overrides,
  });
}

beforeEach(() => {
  fake = createDotloopLoopFake();
});

describe("S34 one loop per approved packet (ARCH-S34-1 / BEH-S34-1)", () => {
  it("creates one loop from the selected profile and template with the packet participants", async () => {
    const provider = providerFor();
    const created = await provider.createLoop({
      templateRef: SELECTION.templateId,
      participantRefs: PARTICIPANTS.map((participant) => participant.email),
      idempotencyKey: "idem-1",
    });
    expect(created.loopRef).toBe("loop-1");

    const loop = fake.loops.get("loop-1")!;
    expect(loop.name).toBe(dotloopLoopNameFor("snapshot-1"));
    expect(loop.name.startsWith(DOTLOOP_LOOP_NAME_PREFIX)).toBe(true);
    expect(loop.templateId).toBe("template-1");
    expect(loop.transactionType).toBe("LEASE_OFFER");
    expect(loop.status).toBe("PRE_OFFER");
    expect(loop.participants.map((participant) => participant.role)).toEqual([
      "TENANT",
      "LANDLORD",
    ]);
    expect(loop.detail["Property Address"]).toMatchObject({
      "Street Name": "4821 Maple Ct",
      City: "Kansas City",
    });
  });

  it("reconciles a lost create response by exact loop name without a second create (AC-S34-4)", async () => {
    const provider = providerFor();
    await provider.createLoop({
      templateRef: SELECTION.templateId,
      participantRefs: PARTICIPANTS.map((participant) => participant.email),
      idempotencyKey: "idem-1",
    });
    expect(fake.createCount).toBe(1);

    // The caller never saw the response; the same confirmed action runs again.
    const again = await provider.createLoop({
      templateRef: SELECTION.templateId,
      participantRefs: PARTICIPANTS.map((participant) => participant.email),
      idempotencyKey: "idem-1",
    });
    expect(again.loopRef).toBe("loop-1");
    expect(fake.createCount).toBe(1);

    await expect(
      provider.reconcile({
        actionKey: "dotloop.loop.create_from_template",
        idempotencyKey: "idem-1",
      }),
    ).resolves.toEqual({ providerRef: "loop-1" });
  });

  it("blocks before any provider call on a mismatched template or unusable participant (BEH-S34-2)", async () => {
    await expect(
      providerFor().createLoop({
        templateRef: "template-other",
        participantRefs: [],
        idempotencyKey: "idem-1",
      }),
    ).rejects.toThrow(/selected Dotloop renewal template/i);
    await expect(
      providerFor({ participants: [] }).createLoop({
        templateRef: SELECTION.templateId,
        participantRefs: [],
        idempotencyKey: "idem-1",
      }),
    ).rejects.toThrow(/at least one resolved participant/i);
    await expect(
      providerFor({
        participants: [{ fullName: "No Email", email: "", role: "TENANT" }],
      }).createLoop({
        templateRef: SELECTION.templateId,
        participantRefs: [],
        idempotencyKey: "idem-1",
      }),
    ).rejects.toThrow(/verified email address/i);
    expect(fake.createCount).toBe(0);
  });

  it("refuses to upload a document without the approved artifact content source", async () => {
    const provider = providerFor();
    await provider.createLoop({
      templateRef: SELECTION.templateId,
      participantRefs: PARTICIPANTS.map((participant) => participant.email),
      idempotencyKey: "idem-1",
    });
    await expect(
      provider.uploadDocument({
        loopRef: "loop-1",
        documentRef: "artifact-1",
        documentType: "renewal_agreement",
        contentHash: "a".repeat(64),
        idempotencyKey: "idem-2",
      }),
    ).rejects.toThrow(/approved artifact content source is not wired/i);
  });

  it("uploads one approved artifact into the packet folder and reads it back", async () => {
    const provider = providerFor({
      artifactContent: async () => ({
        fileName: "renewal.pdf",
        contentType: "application/pdf",
        content: new Uint8Array([1, 2, 3]),
      }),
    });
    await provider.createLoop({
      templateRef: SELECTION.templateId,
      participantRefs: PARTICIPANTS.map((participant) => participant.email),
      idempotencyKey: "idem-1",
    });
    const uploaded = await provider.uploadDocument({
      loopRef: "loop-1",
      documentRef: "artifact-1",
      documentType: "renewal_agreement",
      contentHash: "a".repeat(64),
      idempotencyKey: "idem-2",
    });
    expect(uploaded.documentRef).toMatch(/^loop-1:folder-1:/);
    await expect(
      provider.readDocument(uploaded.documentRef, {
        documentType: "renewal_agreement",
        contentHash: "a".repeat(64),
      }),
    ).resolves.toMatchObject({ loopRef: "loop-1", active: true });
    await expect(
      provider.readDocument("loop-1:folder-1:missing-document"),
    ).resolves.toBeNull();
  });

  it("reads the loop back and reports an archived loop as inactive (BEH-S34-3)", async () => {
    const provider = providerFor();
    await provider.createLoop({
      templateRef: SELECTION.templateId,
      participantRefs: PARTICIPANTS.map((participant) => participant.email),
      idempotencyKey: "idem-1",
    });
    await expect(provider.readLoop("loop-1")).resolves.toMatchObject({
      loopRef: "loop-1",
      templateRef: "template-1",
      active: true,
    });
    fake.archive("loop-1");
    await expect(provider.readLoop("loop-1")).resolves.toMatchObject({ active: false });
    await expect(provider.readLoop("loop-missing")).resolves.toBeNull();
  });
});

describe("S34 loop identity is bound to the packet snapshot hash (ARCH-S34-2)", () => {
  const link: DotloopLoopLink = {
    loopId: "loop-1",
    loopUrl: "https://www.dotloop.com/m/loop/loop-1",
    profileId: "profile-1",
    templateId: "template-1",
    packetSnapshotHash: "hash-1",
    readBackAtIso: null,
    loopStatus: "PRE_OFFER",
    participantCount: 2,
    documentCount: 0,
  };

  it("reuses the stored link for the same hash and never touches the provider", () => {
    expect(
      decideDotloopLoopAction({ currentPacketSnapshotHash: "hash-1", storedLink: link }),
    ).toEqual({ kind: "reuse", link });
  });

  it("marks a loop from different facts superseded rather than reusing it (BEH-S34-2)", () => {
    expect(
      decideDotloopLoopAction({ currentPacketSnapshotHash: "hash-2", storedLink: link }),
    ).toEqual({ kind: "superseded", priorLink: link });
  });

  it("creates when no link exists and refuses a blank hash", () => {
    expect(
      decideDotloopLoopAction({ currentPacketSnapshotHash: "hash-1", storedLink: null }),
    ).toEqual({ kind: "create" });
    expect(() =>
      decideDotloopLoopAction({ currentPacketSnapshotHash: "  ", storedLink: null }),
    ).toThrow(/exact packet snapshot hash/i);
  });

  it("merges a readback without inventing an absent observation", () => {
    const updated = applyDotloopLoopReadback(link, {
      readBackAtIso: "2026-09-03T00:00:00.000Z",
      loopStatus: "UNDER_CONTRACT",
      documentCount: 3,
    });
    expect(updated).toMatchObject({
      readBackAtIso: "2026-09-03T00:00:00.000Z",
      loopStatus: "UNDER_CONTRACT",
      documentCount: 3,
      participantCount: 2,
    });
  });
});

describe("S34 signature handoff is explicit, never inferred (AC-S34-3)", () => {
  it("offers the exact loop URL and required signers when a loop exists", () => {
    const handoff = dotloopSignatureHandoff({
      link: {
        loopId: "loop-1",
        loopUrl: "https://www.dotloop.com/m/loop/loop-1",
        profileId: "profile-1",
        templateId: "template-1",
        packetSnapshotHash: "hash-1",
        readBackAtIso: null,
        loopStatus: null,
        participantCount: 2,
        documentCount: 1,
      },
      requiredSigners: ["Tenant Of Record", "Owner Of Record"],
    });
    expect(handoff).toMatchObject({
      available: true,
      label: "Open in Dotloop to send for signature",
      loopUrl: "https://www.dotloop.com/m/loop/loop-1",
      requiredSigners: ["Tenant Of Record", "Owner Of Record"],
    });
    expect(handoff.detail).toMatch(/signed artifact/i);
  });

  it("says there is nothing to send when no loop exists", () => {
    expect(dotloopSignatureHandoff({ link: null, requiredSigners: [] })).toMatchObject({
      available: false,
      loopUrl: null,
    });
  });

  it("never claims a signature operation the provider does not document", () => {
    for (const path of [
      "lib/integrations/dotloop/renewal-provider.ts",
      "lib/integrations/dotloop/client.ts",
      "lib/lease-documents/dotloop-loop-link.ts",
    ]) {
      const code = readFileSync(path, "utf8").replaceAll(
        /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        "",
      );
      expect(code).not.toMatch(/signatureRequest|sendForSignature|signatureStatus/i);
    }
  });
});
