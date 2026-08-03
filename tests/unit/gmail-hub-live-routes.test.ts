import { afterEach, describe, expect, it, vi } from "vitest";

const { getMaintenanceTicketMock, runtimeSuspension } = vi.hoisted(() => ({
  getMaintenanceTicketMock: vi.fn(),
  runtimeSuspension: {
    current: { status: "clear" } as { status: string },
  },
}));

vi.mock("@/lib/firestore/maintenance-tickets", () => ({
  getMaintenanceTicket: getMaintenanceTicketMock,
}));
vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => runtimeSuspension.current),
}));

import { POST as linkCommunication } from "@/app/api/gmail-hub/communications/link/route";
import { POST as prepareSend } from "@/app/api/gmail-hub/send-confirmations/route";
import { GET as getThreads } from "@/app/api/gmail-hub/threads/route";
import {
  GET as getWatchPreview,
  POST as renewWatch,
} from "@/app/api/gmail-hub/watch/route";
import { setAuthResolverForTest, type AuthenticatedUser } from "@/lib/auth/session";
import {
  createGmailHubRuntimeDependencies,
  GmailHubEnvironmentConfigurationError,
  setGmailHubDependenciesForTest,
} from "@/lib/gmail-hub/dependencies";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";
import { setGmailPushOidcVerifierForTest } from "@/lib/gmail-hub/pubsub";
import { MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import { SIMULATION_RUN_ID } from "@/tests/helpers/lease-renewal-simulation";
import {
  ActionRuntimeSuspendedError,
  assertProductionRuntimeActionExecutable,
} from "@/lib/operations/runtime-suspension-gate";

const actor: AuthenticatedUser = {
  uid: "user-josiah",
  email: "josiah@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Approver",
};

function renewalContext(actionKey: string): WorkflowCommunicationContext {
  return {
    lane: "renewals",
    entityType: "renewal_run",
    entityId: SIMULATION_RUN_ID,
    purpose: "renewal_owner",
    actionKey,
    sourceRefs: [`renewal_run:${SIMULATION_RUN_ID}`],
    templateRef: "template:not-approved:v1",
  };
}

function maintenanceContext(actionKey: string): WorkflowCommunicationContext {
  return {
    lane: "maintenance",
    entityType: "maintenance_ticket",
    entityId: "ticket:test-maple-leak",
    purpose: "maintenance_owner",
    actionKey,
    sourceRefs: ["maintenance_ticket:ticket:test-maple-leak"],
  };
}

function installDependencies(
  assertRuntimeActionExecutable: (action: string) => Promise<void> = async () =>
    undefined,
  assertEffectEnvironment: () => void = () => undefined,
) {
  let clientsCreated = 0;
  const createClient = vi.fn((subject: string) => {
    clientsCreated += 1;
    return new GmailRuntimeClient({
      subject,
      transport: {
        async send() {
          throw new Error("unexpected Gmail transport");
        },
      },
      getToken: async () => "unused",
    });
  });
  const store = new MemoryGmailStateStore();
  setGmailHubDependenciesForTest({
    createClient,
    store,
    assertEffectEnvironment,
    assertRuntimeActionExecutable,
  });
  return { createClient, clientsCreated: () => clientsCreated, store };
}

function threadsRequest(context: WorkflowCommunicationContext) {
  return new Request(
    `https://example.test/api/gmail-hub/threads?context=${encodeURIComponent(JSON.stringify(context))}`,
  );
}

function watchRequest() {
  return new Request("https://example.test/api/gmail-hub/watch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mailboxEmail: actor.email,
      topicName: "projects/pmi-kc-kb-prod/topics/gmail-replies",
      observedWatchExpirationMs: null,
      attemptKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f51",
      confirmed: true,
    }),
  });
}

afterEach(() => {
  setAuthResolverForTest(null);
  setGmailHubDependenciesForTest(null);
  getMaintenanceTicketMock.mockReset();
  setGmailPushOidcVerifierForTest(null);
  runtimeSuspension.current = { status: "clear" };
  vi.unstubAllEnvs();
});

function installPushConfig() {
  vi.stubEnv("GMAIL_PUBSUB_TOPIC", "projects/pmi-kc-kb-prod/topics/gmail-replies");
  vi.stubEnv("GMAIL_PUBSUB_AUDIENCE", "https://audit.example.test/gmail-push");
  vi.stubEnv(
    "GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT",
    "gmail-push@pmi-kc-kb-prod.iam.gserviceaccount.com",
  );
}

function authenticatedPushRequest() {
  const data = Buffer.from(
    JSON.stringify({ emailAddress: actor.email, historyId: "123456" }),
  ).toString("base64url");
  return new Request("https://audit.example.test/gmail-push", {
    method: "POST",
    headers: {
      authorization: "Bearer synthetic-oidc",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: { data, messageId: "push-message-1" },
      subscription: "projects/pmi-kc-kb-prod/subscriptions/gmail-replies-production",
    }),
  });
}

describe("Workflow Communications route boundaries (AC-GW-1, AC-GW-3, AC-GW-5)", () => {
  // S51_DYNAMIC_REFUSAL:gmail-pubsub-client
  it.each(["action_suspended", "global_suspended", "unreadable"])(
    "authenticates the push but constructs no Gmail client when runtime state is %s",
    async (status) => {
      installPushConfig();
      setGmailPushOidcVerifierForTest(async () => ({
        email: "gmail-push@pmi-kc-kb-prod.iam.gserviceaccount.com",
        email_verified: true,
      }));
      runtimeSuspension.current = { status };
      const tracker = installDependencies(assertProductionRuntimeActionExecutable);

      const response = await (
        await import("@/app/api/gmail-hub/pubsub/route")
      ).POST(authenticatedPushRequest());

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: "action_runtime_suspended",
      });
      expect(tracker.createClient).not.toHaveBeenCalled();
      expect(tracker.clientsCreated()).toBe(0);
    },
  );

  it("maps runtime suspension to its distinct Gmail-route 409 contract", async () => {
    const response = gmailHubErrorResponse(
      new ActionRuntimeSuspendedError("gmail.mailbox.read"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "action_runtime_suspended",
      error: 'Action "gmail.mailbox.read" is closed by the runtime suspension gate.',
    });
  });

  it("returns an exact watch preview and rejects confirmation drift before Gmail", async () => {
    installPushConfig();
    const tracker = installDependencies();
    setAuthResolverForTest(async () => actor);

    const preview = await getWatchPreview();
    expect(preview.status).toBe(200);
    await expect(preview.json()).resolves.toMatchObject({
      mailboxEmail: actor.email,
      topicName: "projects/pmi-kc-kb-prod/topics/gmail-replies",
      currentWatchExpirationMs: null,
      risk: expect.stringContaining("Live Gmail watch mutation"),
    });
    expect(tracker.clientsCreated()).toBe(0);

    const drifted = await renewWatch(
      new Request("https://example.test/api/gmail-hub/watch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mailboxEmail: "different@pmikcmetro.com",
          topicName: "projects/pmi-kc-kb-prod/topics/gmail-replies",
          observedWatchExpirationMs: null,
          attemptKey: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f51",
          confirmed: true,
        }),
      }),
    );
    expect(drifted.status).toBe(409);
    expect(tracker.clientsCreated()).toBe(0);
  });

  it.each([
    ["Demo", "demo", "demo"],
    ["Live read-only", "demo", "live_readonly"],
  ] as const)(
    "refuses a %s watch through runtime composition before state or provider work",
    async (_name, environmentKind, dataContext) => {
      installPushConfig();
      setAuthResolverForTest(async () => actor);
      const store = new MemoryGmailStateStore();
      const constructClient = vi.fn(
        (subject: string) =>
          new GmailRuntimeClient({
            subject,
            transport: {
              async send() {
                throw new Error("unexpected Gmail transport");
              },
            },
            getToken: async () => "unused",
          }),
      );
      const dependencies = createGmailHubRuntimeDependencies(
        {
          ENVIRONMENT_KIND: environmentKind,
          DATA_CONTEXT: dataContext,
        },
        {
          constructClient,
          createStore: () => store,
        },
      );
      setGmailHubDependenciesForTest({
        ...dependencies,
        assertRuntimeActionExecutable: async () => undefined,
      });

      const response = await renewWatch(watchRequest());

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: "environment_context_not_allowed",
      });
      expect(store.mailboxStates.size).toBe(0);
      expect(store.audit).toEqual([]);
      expect(constructClient).not.toHaveBeenCalled();
    },
  );

  it("returns a typed 503 for an invalid descriptor before state or provider work", async () => {
    installPushConfig();
    setAuthResolverForTest(async () => actor);
    const tracker = installDependencies(
      async () => undefined,
      () => {
        throw new GmailHubEnvironmentConfigurationError(
          "Environment descriptor is invalid: DATA_CONTEXT is not set.",
        );
      },
    );

    const response = await renewWatch(watchRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Environment descriptor is invalid: DATA_CONTEXT is not set.",
    });
    expect(tracker.store.mailboxStates.size).toBe(0);
    expect(tracker.store.audit).toEqual([]);
    expect(tracker.createClient).not.toHaveBeenCalled();
    expect(tracker.clientsCreated()).toBe(0);
  });

  it("returns 401 before constructing a Gmail client for a valid workflow reference", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => null);

    const response = await getThreads(
      threadsRequest(renewalContext("gmail.mailbox.read")),
    );

    expect(response.status).toBe(401);
    expect(tracker.clientsCreated()).toBe(0);
  });

  it("rejects arbitrary mailbox/query values before Gmail", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => actor);

    const response = await getThreads(
      new Request(
        `https://example.test/api/gmail-hub/threads?mailbox=dan%40pmikcmetro.com&context=${encodeURIComponent(JSON.stringify(renewalContext("gmail.mailbox.read")))}`,
      ),
    );

    expect(response.status).toBe(409);
    expect(tracker.clientsCreated()).toBe(0);
  });

  it("rejects a missing workflow context before Gmail", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => actor);

    const response = await getThreads(
      new Request("https://example.test/api/gmail-hub/threads"),
    );

    expect(response.status).toBe(400);
    expect(tracker.clientsCreated()).toBe(0);
  });

  it("fails a wrong-domain Test identity closed before any Gmail client", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => ({ ...actor, email: "person@gmail.com" }));

    const response = await getThreads(
      threadsRequest(renewalContext("gmail.mailbox.read")),
    );

    expect(response.status).toBe(409);
    expect(tracker.clientsCreated()).toBe(0);
  });

  it("rejects mailbox identity fields in strict confirmation JSON", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => actor);
    const response = await prepareSend(
      new Request("https://example.test/api/gmail-hub/send-confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          context: renewalContext("gmail.thread.reply"),
          message: { kind: "reply", threadId: "thread-1", body: "Synthetic" },
          subjectUser: "dan@pmikcmetro.com",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(tracker.clientsCreated()).toBe(0);
  });

  it("allows Editor send capability but still denies simulation mutations before Gmail", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => ({ ...actor, role: "Editor" }));
    const response = await prepareSend(
      new Request("https://example.test/api/gmail-hub/send-confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          context: renewalContext("gmail.thread.reply"),
          message: { kind: "reply", threadId: "thread-1", body: "Synthetic" },
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(tracker.clientsCreated()).toBe(0);
  });

  it("denies a maintenance-scoped user access to renewal communication", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => ({ ...actor, scopes: ["maintenance"] }));

    const response = await getThreads(
      threadsRequest(renewalContext("gmail.mailbox.read")),
    );

    expect(response.status).toBe(403);
    expect(tracker.clientsCreated()).toBe(0);
  });

  it("rejects every Test Maintenance Gmail read before client construction", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => actor);
    getMaintenanceTicketMock.mockResolvedValue({
      id: "ticket:test-maple-leak",
      data_mode: "test",
    });

    const response = await getThreads(
      threadsRequest(maintenanceContext("gmail.mailbox.read")),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Test maintenance tickets cannot access Live Gmail communication.",
    });
    expect(tracker.clientsCreated()).toBe(0);
  });

  it("rejects Test Maintenance Gmail linking before client construction", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => actor);
    getMaintenanceTicketMock.mockResolvedValue({
      id: "ticket:test-maple-leak",
      data_mode: "test",
    });

    const response = await linkCommunication(
      new Request("https://example.test/api/gmail-hub/communications/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          context: maintenanceContext("gmail.mailbox.read"),
          threadId: "thread-live-1",
          reason: "Test must refuse this Live Gmail link",
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(tracker.clientsCreated()).toBe(0);
  });

  it("rejects Test renewal reads before client construction", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => actor);

    const response = await getThreads(
      threadsRequest(renewalContext("gmail.mailbox.read")),
    );

    expect(response.status).toBe(409);
    expect(tracker.clientsCreated()).toBe(0);
  });
});
