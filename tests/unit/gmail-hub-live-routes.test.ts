import { afterEach, describe, expect, it } from "vitest";

import { GET as getThreads } from "@/app/api/gmail-hub/threads/route";
import { POST as prepareSend } from "@/app/api/gmail-hub/send-confirmations/route";
import { setAuthResolverForTest, type AuthenticatedUser } from "@/lib/auth/session";
import { setGmailHubDependenciesForTest } from "@/lib/gmail-hub/dependencies";
import { MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";

const actor: AuthenticatedUser = {
  uid: "user-josiah",
  email: "josiah@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Approver",
};

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

afterEach(() => {
  setAuthResolverForTest(null);
  setGmailHubDependenciesForTest(null);
});

describe("Gmail Hub live route boundaries (AC-S19-2, AC-S19-8)", () => {
  it("returns 401 before constructing any Gmail client", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => null);

    const response = await getThreads(
      new Request("https://example.test/api/gmail-hub/threads"),
    );

    expect(response.status).toBe(401);
    expect(tracker.clientsCreated()).toBe(0);
  });

  it("rejects browser-supplied mailbox/impersonation query values before Gmail", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => actor);

    const response = await getThreads(
      new Request(
        "https://example.test/api/gmail-hub/threads?mailbox=dan%40pmikcmetro.com",
      ),
    );

    expect(response.status).toBe(409);
    expect(tracker.clientsCreated()).toBe(0);
  });

  it("fails a wrong-domain authenticated email closed before any Gmail transport", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => ({ ...actor, email: "person@gmail.com" }));

    const response = await getThreads(
      new Request("https://example.test/api/gmail-hub/threads"),
    );

    expect(response.status).toBe(403);
    expect(tracker.clientsCreated()).toBe(1);
  });

  it("rejects mailbox identity fields in strict send-confirmation JSON", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => actor);
    const response = await prepareSend(
      new Request("https://example.test/api/gmail-hub/send-confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "new",
          subject: "Synthetic",
          body: "Synthetic body",
          subjectUser: "dan@pmikcmetro.com",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(tracker.clientsCreated()).toBe(0);
  });

  it("separates edit from explicit-send authority", async () => {
    const tracker = installDependencies();
    setAuthResolverForTest(async () => ({ ...actor, role: "Editor" }));
    const response = await prepareSend(
      new Request("https://example.test/api/gmail-hub/send-confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "new", subject: "Synthetic", body: "Body" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(tracker.clientsCreated()).toBe(0);
  });
});
