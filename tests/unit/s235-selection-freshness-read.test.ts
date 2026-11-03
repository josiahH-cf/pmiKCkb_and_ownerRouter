import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { readSelectionFreshness } from "@/lib/lease-documents/packet-selection-freshness-read";

const reads = vi.hoisted(() => ({
  settings: vi.fn(),
  observation: vi.fn(),
  connection: vi.fn(),
}));
vi.mock("@/lib/firestore/dotloop-renewal-settings", () => ({
  getDotloopRenewalSettings: reads.settings,
}));
vi.mock("@/lib/firestore/dotloop-connection-observations", () => ({
  FirestoreDotloopObservationStore: class {
    read = reads.observation;
  },
}));
vi.mock("@/lib/firestore/connector-connections", () => ({
  FirestoreConnectorConnectionStore: class {
    getConnection = reads.connection;
  },
}));
const AT = "2026-11-03T12:00:00.000Z";
const actor = { uid: "fixture-editor", role: "Editor" } as AuthenticatedUser;
const selected = {
  version: 1,
  profileId: "fixture-profile",
  profileLabel: "Fixture office",
  templateId: "fixture-template",
  templateLabel: "Fixture renewal",
  transactionType: "LEASE_OFFER",
  initialStatus: "PRE_OFFER",
  recordedAtIso: AT,
};
const observed = () => ({
  generationId: "fixture-generation",
  observedAt: AT,
  account: { email: "integrations@pmikcmetro.com" },
  accountError: null,
  profiles: [{ id: selected.profileId, name: selected.profileLabel, type: "INDIVIDUAL" }],
  profilesError: null,
  templates: [
    {
      profileId: selected.profileId,
      error: null,
      templates: [
        {
          id: selected.templateId,
          name: selected.templateLabel,
          transactionType: "LEASE_OFFER",
        },
      ],
    },
  ],
  subscriptionsReadable: null,
});
beforeEach(() => {
  vi.clearAllMocks();
  reads.settings.mockResolvedValue(selected);
  reads.observation.mockResolvedValue(observed());
  reads.connection.mockResolvedValue({
    status: "connected",
    generationId: "fixture-generation",
    oauthState: "ready",
  });
});

describe("S235 current selection read boundary", () => {
  it("reads current connection generation and refuses an old generation without provider work", async () => {
    reads.connection.mockResolvedValue({
      status: "connected",
      generationId: "new-fixture-generation",
    });
    expect((await readSelectionFreshness(actor, AT)).problems.join(" ")).toMatch(
      /different connection generation/,
    );
    expect(reads.connection).toHaveBeenCalledWith("dotloop");
    expect(reads.observation).toHaveBeenCalledTimes(1);
    expect(reads.settings).toHaveBeenCalledWith(actor);
  });

  it("reports an unreadable connection rather than claiming a matching selection", async () => {
    reads.connection.mockRejectedValue(Error("fixture denied"));
    expect((await readSelectionFreshness(actor, AT)).problems.join(" ")).toMatch(
      /connection could not be read/,
    );
  });

  it("does not turn an unrelated diagnostic profile denial into a failed selected-template read", async () => {
    const observation = observed();
    observation.templates.push({
      profileId: "fixture-company",
      error: "access_denied",
      templates: [],
    } as never);
    reads.observation.mockResolvedValue(observation);
    expect((await readSelectionFreshness(actor, AT)).problems).toEqual([]);
  });

  it("names a failed selected-profile template read", async () => {
    const observation = observed();
    observation.templates = [
      { profileId: selected.profileId, error: "access_denied", templates: [] },
    ] as never;
    reads.observation.mockResolvedValue(observation);
    expect((await readSelectionFreshness(actor, AT)).problems.join(" ")).toMatch(
      /saved profile|saved template/,
    );
  });
});
