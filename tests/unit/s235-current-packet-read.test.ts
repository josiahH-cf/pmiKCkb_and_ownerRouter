import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import * as packetInput from "@/lib/lease-documents/live-input";
import { planPacketInputsSave } from "@/lib/lease-documents/packet-inputs";
import { packetInputsDocId } from "@/lib/firestore/lease-packet-inputs";

const provider = vi.hoisted(() => ({
  construction: vi.fn(),
  source: vi.fn(),
  admission: vi.fn(),
}));
vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRentVineConfig: provider.construction,
}));
vi.mock("@/lib/lease-renewal/live-lease-cache", () => ({
  requireCurrentLeaseViews: provider.source,
}));
vi.mock("@/lib/firestore/renewal-notice-safety", () => ({
  withRenewalNoticeAdmission: provider.admission,
}));
vi.mock("@/lib/firestore/renewal-workspace", () => ({
  getRenewalWorkspace: async () => null,
  renewalWorkspaceDocId: (id: string) => `workspace-${id}`,
}));

const AT = "2026-11-03T12:00:00.000Z";
const actor = { uid: "fixture-editor", role: "Editor" } as AuthenticatedUser;
const view = { leaseID: 701, startDate: "2026-01-01", endDate: "2026-12-31" };

function fixtureDb(record: unknown, failRead = false) {
  const write = vi.fn(() => {
    throw Error("a readiness read must not write");
  });
  const records: Record<string, unknown> = {
    [`lease_document_packet_inputs/${packetInputsDocId("701")}`]: record,
  };
  const db = {
    collection: (collection: string) => ({
      doc: (id: string) => ({
        get: async () => {
          if (failRead) throw Error("fixture current read unavailable");
          const value = records[`${collection}/${id}`];
          return { exists: value !== undefined, data: () => value };
        },
        set: write,
        create: write,
        update: write,
      }),
    }),
    runTransaction: write,
  };
  return { db: db as unknown as Firestore, write };
}

beforeEach(() => {
  vi.clearAllMocks();
  provider.construction.mockImplementation(() => {
    throw Error("readiness constructed a provider");
  });
  provider.source.mockImplementation(() => {
    throw Error("readiness requested another provider source");
  });
  provider.admission.mockImplementation(() => {
    throw Error("readiness changed admission metadata");
  });
});

describe("S235 A03 current packet read from this page's source", () => {
  it("resolves current inherited context without a snapshot, provider or write", async () => {
    const { record } = planPacketInputsSave(
      null,
      {
        leaseId: "701",
        operationId: "10000000-0000-4000-8000-000000000001",
        facts: [
          {
            fieldKey: "transaction.type",
            value: "existing_renewal",
            expectedRevision: 0,
          },
          { fieldKey: "management.origin", value: "inherited", expectedRevision: 0 },
        ],
      },
      {
        actorUid: actor.uid,
        nowIso: AT,
        eventId: "00000000-0000-4000-8000-000000000001",
      },
    );
    const { db, write } = fixtureDb(record);
    const resolved = await packetInput.resolveDisplayedPacketInput(
      actor,
      "701",
      "701",
      AT,
      [view],
      db,
    );
    const evaluated = evaluateRenewalPacket(resolved.input);
    expect(evaluated.packetContext).toBe("full_lease_packet");
    expect(evaluated.classificationEvidence?.managementOrigin?.source).toMatchObject({
      system: "renewal_staff_entry",
      retrievedAt: AT,
      version: "1",
    });
    expect(write).not.toHaveBeenCalled();
    expect(provider.construction).not.toHaveBeenCalled();
    expect(provider.source).not.toHaveBeenCalled();
    expect(provider.admission).not.toHaveBeenCalled();
  });

  it("fails a current read rather than substituting a saved evaluation", async () => {
    const { db, write } = fixtureDb(undefined, true);
    await expect(
      packetInput.resolveDisplayedPacketInput(actor, "701", "701", AT, [view], db),
    ).rejects.toThrow(/current read unavailable/);
    expect(write).not.toHaveBeenCalled();
    expect(provider.source).not.toHaveBeenCalled();
  });

  it("refuses a wrong or ambiguous page source before resolving packet facts", async () => {
    const { db, write } = fixtureDb(undefined);
    await expect(
      packetInput.resolveDisplayedPacketInput(
        actor,
        "701",
        "701",
        AT,
        [{ leaseID: 702 }],
        db,
      ),
    ).rejects.toThrow(/missing or ambiguous/);
    await expect(
      packetInput.resolveDisplayedPacketInput(actor, "701", "701", AT, [view, view], db),
    ).rejects.toThrow(/missing or ambiguous/);
    expect(write).not.toHaveBeenCalled();
  });
});
