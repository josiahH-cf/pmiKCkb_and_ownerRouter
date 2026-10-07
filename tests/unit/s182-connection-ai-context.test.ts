// S182 AC-S182-5 (fail-first): Dotloop's token refresh outcome and its revocation evidence come from
// Dotloop responses, so the assistant's connection read withholds them exactly like the
// provider-derived live verdict. Only the app's own lifecycle status (connected, disconnecting,
// disconnected) reaches the assistant, its answer and saved history, and that view is the same for
// every role, so a reopened answer after a narrowing keeps only what every reader may see.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import type { ConnectorConnectionRecord } from "@/lib/connections/connector-connection";

const state = vi.hoisted(() => ({ records: [] as unknown[] }));

vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => ({}) }));
vi.mock("@/lib/lease-renewal/assistant-source", () => ({
  loadRenewalAssistantSource: vi.fn(),
}));
vi.mock("@/lib/firestore/approval-queue", () => ({ listApprovalQueue: vi.fn() }));
vi.mock("@/lib/lease-renewal/renewal-review-board", () => ({
  loadRenewalRunViews: vi.fn(),
}));
vi.mock("@/lib/firestore/work-accountability", () => ({
  WorkAccountabilityStore: class {
    listSnapshot() {
      return Promise.reject(new Error("not read here"));
    }
  },
}));
vi.mock("@/lib/work-accountability/roster", () => ({ listWorkAssignableUsers: vi.fn() }));
vi.mock("@/lib/gmail-hub/dependencies", () => ({
  createGmailHubService: () => ({ listCommunications: vi.fn() }),
}));
vi.mock("@/lib/firestore/workflows", () => ({
  listProcessDefinitions: vi.fn(),
  listWorkflowRuns: vi.fn(),
}));
vi.mock("@/lib/firestore/maintenance-tickets", () => ({
  listMaintenanceTickets: vi.fn(),
}));
vi.mock("@/lib/firestore/maintenance-property-preapprovals", () => ({
  listMaintenancePropertyPreapprovals: async () => [],
}));
vi.mock("@/lib/firestore/maintenance-work-order-links", () => ({
  getMaintenanceWorkOrderLink: vi.fn(),
  listMaintenanceWorkOrderLinks: vi.fn(),
}));
vi.mock("@/lib/connections/verification", () => ({
  getVerifiedConnectorIds: async () => new Set<string>(["dotloop"]),
  getVerifiedConnectorIdsForAiContext: async () => new Set<string>(),
}));
vi.mock("@/lib/firestore/connector-connections", () => ({
  getConnectorConnectionStore: () => ({ listConnections: async () => state.records }),
}));

import {
  accessNarrowedSince,
  projectStoredAssistantAnswer,
  StoredAssistantAnswerSchema,
} from "@/lib/assistant-history/stored-answer";
import {
  conversationActorKey,
  runAssistantConversation,
} from "@/lib/assistant/conversation";
import { createServerOperationalContext } from "@/lib/operational-context/server-context";

const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin-1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor-1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const NOW = new Date("2026-10-07T12:00:00.000Z");
const GENERATION = "0f1e2d3c-4b5a-4968-8776-655443322110";
const OPERATION = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function dotloopConnected(
  oauthState: "ready" | "refreshing" | "refresh_needed",
): ConnectorConnectionRecord {
  return {
    connectorId: "dotloop",
    method: "oauth",
    status: "connected",
    secretRef: "projects/fixture/secrets/dotloop-access/versions/1",
    connectedByUid: admin.uid,
    connectedAt: "2026-10-06T12:00:00.000Z",
    generationId: GENERATION,
    revision: 3,
    updatedAt: "2026-10-07T11:00:00.000Z",
    oauthState,
  };
}

function dotloopRevoked(
  providerRevocation: "verified" | "unverified",
  complete = true,
): ConnectorConnectionRecord {
  return {
    connectorId: "dotloop",
    method: "oauth",
    status: "revoked",
    generationId: GENERATION,
    revision: 5,
    operationId: OPERATION,
    requestedByUid: admin.uid,
    requestedAt: "2026-10-07T10:00:00.000Z",
    // A record missing its completion time is not a safe revoked record (the Admin's manual case).
    ...(complete ? { completedAt: "2026-10-07T10:00:05.000Z" } : {}),
    updatedAt: "2026-10-07T10:00:05.000Z",
    destroyOutcome: "destroyed",
    providerRevocation,
  } as ConnectorConnectionRecord;
}

async function dotloopRecord(user: AuthenticatedUser) {
  const read = await createServerOperationalContext(user, NOW).read("connections");
  return read.records.find((record) => record.ref.id === "dotloop")!;
}

async function connectionsAnswer(user: AuthenticatedUser) {
  return StoredAssistantAnswerSchema.parse(
    await runAssistantConversation(
      { question: "What applications are connected?", conversation: null },
      {
        nowIso: NOW.toISOString(),
        actorKey: conversationActorKey(user.uid),
        context: createServerOperationalContext(user, NOW),
        interpret: null,
      },
    ),
  );
}

const PROVIDER_OUTCOME_TEXT = [
  "Reconnect required",
  "Refreshing connection",
  "credentials must be ready",
  "did not confirm",
  "Credential removal was verified",
];

beforeEach(() => {
  state.records = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("S182 the assistant's connection read withholds Dotloop provider outcomes", () => {
  it.each(["refresh_needed", "refreshing"] as const)(
    "reports a Dotloop connection whose token state is %s only as the app's own connection",
    async (oauthState) => {
      state.records = [dotloopConnected(oauthState)];
      const record = await dotloopRecord(editor);
      for (const text of PROVIDER_OUTCOME_TEXT) expect(record.detail).not.toContain(text);
      expect(record.detail).toBe("Connected · Set up by an Admin.");
      expect(record.facts).toMatchObject({
        state: "connected",
        verifiedByLiveCheck: false,
      });
    },
  );

  it.each(["verified", "unverified"] as const)(
    "reports a Dotloop disconnect with %s provider evidence only as the app's own removal",
    async (providerRevocation) => {
      state.records = [dotloopRevoked(providerRevocation)];
      const record = await dotloopRecord(editor);
      for (const text of PROVIDER_OUTCOME_TEXT) expect(record.detail).not.toContain(text);
      expect(record.detail).toBe(
        "Disconnected · The app's stored credentials were removed. Reconnect to restore access.",
      );
      expect(record.facts).toMatchObject({ state: "none" });
    },
  );

  it("gives every role the same connection read", async () => {
    for (const records of [
      [dotloopConnected("refresh_needed")],
      [dotloopRevoked("unverified")],
      [dotloopRevoked("unverified", false)],
    ]) {
      state.records = records;
      expect(await dotloopRecord(admin)).toEqual(await dotloopRecord(editor));
    }
  });

  it("keeps the outcomes out of the answer and its saved history", async () => {
    state.records = [dotloopRevoked("unverified")];
    const answer = await connectionsAnswer(editor);
    const text = JSON.stringify(answer);
    for (const outcome of PROVIDER_OUTCOME_TEXT) expect(text).not.toContain(outcome);
    expect(text).toContain("The app's stored credentials were removed.");
  });

  it("reopens an answer after a narrowing with only the status every role sees", async () => {
    state.records = [dotloopRevoked("unverified", false)];
    const asAdmin = await connectionsAnswer(admin);
    const asEditor = await connectionsAnswer(editor);
    const basis = { role: "Admin" as const, scopes: null };
    expect(accessNarrowedSince(basis, editor)).toBe(true);
    const reopened = projectStoredAssistantAnswer(asAdmin, basis, editor);
    const connections = (answer: typeof asAdmin) =>
      answer.groups.find((group) => group.source === "connections");
    expect(connections(reopened)).toEqual(connections(asEditor));
  });
});
