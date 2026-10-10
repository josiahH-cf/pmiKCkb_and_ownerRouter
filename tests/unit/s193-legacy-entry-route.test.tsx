// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const source = vi.hoisted(() => ({ reads: vi.fn(async () => [{ leaseID: 115 }]) }));
vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: {} }),
}));
vi.mock("@/lib/lease-renewal/live-lease-cache", () => ({
  requireCurrentLeaseViews: source.reads,
}));
vi.mock("@/lib/firestore/renewal-notice-safety", () => ({
  withRenewalNoticeAdmission: (_actor: unknown, client: unknown) => client,
}));
import { WorkflowCommunicationsHub } from "@/components/gmail-hub/WorkflowCommunicationsHub";
import { GET as linkedThreadsGET } from "@/app/api/gmail-hub/threads/route";
import { setAuthResolverForTest, type AuthenticatedUser } from "@/lib/auth/session";
import { setGmailHubDependenciesForTest } from "@/lib/gmail-hub/dependencies";
import { MemoryGmailStateStore, gmailMailboxKey } from "@/lib/gmail-hub/state-store";
import { communicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";
const actor: AuthenticatedUser = {
  uid: "legacy-entry-owner",
  email: "legacy-entry-owner@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
let store: MemoryGmailStateStore;
const client = vi.fn(() => {
  throw Error("Legacy discovery must not construct Gmail");
});
beforeEach(async () => {
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  source.reads.mockClear();
  client.mockClear();
  store = new MemoryGmailStateStore();
  const now = Date.now();
  await store.saveCommunicationLink({
    id: "original-legacy-link",
    actor_uid: actor.uid,
    mailbox_key: gmailMailboxKey(actor.email),
    lane: "renewals",
    entity_type: "renewal_lease",
    entity_id: "115",
    purpose: "renewal_owner",
    origin_action_key: "gmail.renewal_notice.draft_create",
    source_refs: ["rentvine:lease:115"],
    status: "draft_created",
    draft_id: "original-unsent-draft",
    gmail_thread_id: "original-gmail-thread",
    created_at_ms: now,
    updated_at_ms: now,
    ...communicationsRetentionFields("workflow_link", now),
  });
  setAuthResolverForTest(async () => actor);
  setGmailHubDependenciesForTest({
    store,
    createClient: client,
    assertEffectEnvironment: () => {
      throw Error("No authority from a historical link");
    },
    assertRuntimeActionExecutable: async () => {},
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        "https://example.test",
      );
      if (url.pathname === "/api/gmail-hub/threads")
        return linkedThreadsGET(new Request(url));
      if (url.pathname === "/api/gmail-hub/sequences")
        return Response.json({ sequences: [], cursor: null });
      throw Error(`Unexpected entry-point request: ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  cleanup();
  setAuthResolverForTest(null);
  setGmailHubDependenciesForTest(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", "/");
});
function open(id = "115") {
  window.history.replaceState(
    null,
    "",
    `/gmail-hub?workflow=renewal_lease&record=${id}&purpose=renewal_owner`,
  );
  render(<WorkflowCommunicationsHub authenticatedEmail={actor.email} />);
}
it("opens a saved legacy URL through the rendered owning control and actual authorization/list route without changing an original draft or granting Send", async () => {
  const before = await store.listCommunicationLinks(actor.email);
  open();
  await screen.findByRole("heading", { name: "Existing linked conversation" });
  expect(screen.getByRole("link", { name: "Compose in Communications" })).toHaveAttribute(
    "href",
    "/gmail-hub?compose=renewal_owner&lease=115",
  );
  fireEvent.click(screen.getByRole("button", { name: "Load linked communication" }));
  await screen.findByRole("button", { name: /Open renewal owner/ });
  expect(source.reads).toHaveBeenCalledTimes(1);
  expect(await store.listCommunicationLinks(actor.email)).toEqual(before);
  expect(
    screen.queryByRole("button", {
      name: /Send|Schedule|Create Gmail draft|Confirm reply/i,
    }),
  ).not.toBeInTheDocument();
  expect(client).not.toHaveBeenCalled();
  setAuthResolverForTest(async () => ({
    ...actor,
    uid: "other-staff",
    email: "other-staff@pmikcmetro.com",
  }));
  fireEvent.click(screen.getByRole("button", { name: "Load linked communication" }));
  await screen.findByText("No Gmail thread is linked.");
  expect(
    screen.queryByRole("button", { name: /Open renewal owner/ }),
  ).not.toBeInTheDocument();
  expect(client).not.toHaveBeenCalled();
});
it("refuses a saved URL whose lease no longer exists in the complete current source without revealing the private historical link", async () => {
  open("999");
  await screen.findByRole("heading", { name: "Existing linked conversation" });
  fireEvent.click(screen.getByRole("button", { name: "Load linked communication" }));
  await waitFor(() =>
    expect(
      screen.getByText(/target does not exist in the current live lease read/),
    ).toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("button", { name: /Open renewal owner/ }),
  ).not.toBeInTheDocument();
  expect(client).not.toHaveBeenCalled();
});
