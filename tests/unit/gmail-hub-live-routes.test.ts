import { afterEach, describe, expect, it } from "vitest";

import { POST as prepareSend } from "@/app/api/gmail-hub/send-confirmations/route";
import { GET as getThreads } from "@/app/api/gmail-hub/threads/route";
import { setAuthResolverForTest, type AuthenticatedUser } from "@/lib/auth/session";
import { setGmailHubDependenciesForTest } from "@/lib/gmail-hub/dependencies";
import { MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import { SIMULATION_RUN_ID } from "@/lib/lease-renewal/simulation";

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

function installDependencies() {
  let clientsCreated = 0;
  setGmailHubDependenciesForTest({
    createClient(subject) {
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
    },
    store: new MemoryGmailStateStore(),
    isActionExecutable: () => true,
  });
  return { clientsCreated: () => clientsCreated };
}

function threadsRequest(context: WorkflowCommunicationContext) {
  return new Request(
    `https://example.test/api/gmail-hub/threads?context=${encodeURIComponent(JSON.stringify(context))}`,
  );
}

afterEach(() => {
  setAuthResolverForTest(null);
  setGmailHubDependenciesForTest(null);
});

describe("Workflow Communications route boundaries (AC-GW-1, AC-GW-3, AC-GW-5)", () => {
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

  it("fails a wrong-domain test identity closed before any Gmail transport", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => ({ ...actor, email: "person@gmail.com" }));

    const response = await getThreads(
      threadsRequest(renewalContext("gmail.mailbox.read")),
    );

    expect(response.status).toBe(403);
    expect(tracker.clientsCreated()).toBe(1);
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
});
