import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { GmailHubService } from "@/lib/gmail-hub/service";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import {
  MemoryGmailStateStore,
  type GmailMailboxState,
} from "@/lib/gmail-hub/state-store";

const actor: AuthenticatedUser = {
  uid: "synthetic-mailbox-health",
  email: "synthetic-mailbox-health@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const now = Date.parse("2026-10-19T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

function fixture(state: Partial<GmailMailboxState> | null) {
  const store = new MemoryGmailStateStore();
  if (state)
    store.mailboxStates.set(actor.email, {
      mailbox_email: actor.email,
      user_uid: actor.uid,
      history_id: "synthetic-history-1",
      health: "connected",
      last_successful_sync_ms: now - 1000,
      updated_at_ms: now - 1000,
      ...state,
    });
  const transport = {
    send: vi.fn(async () => {
      throw new Error("No fixture transport dispatch");
    }),
  };
  const client = new GmailRuntimeClient({ subject: actor.email, transport });
  vi.spyOn(client, "getProfile").mockResolvedValue({
    emailAddress: actor.email,
    messagesTotal: 0,
    threadsTotal: 0,
    historyId: "synthetic-history-2",
  });
  const hub = new GmailHubService(actor, {
    store,
    createClient: () => client,
    now: () => now,
    assertEffectEnvironment: () => {
      throw new Error("Health reads cannot authorize effects");
    },
    assertRuntimeActionExecutable: async (key) => {
      expect(key).toBe("gmail.mailbox.read");
    },
  });
  return { hub, store, transport };
}

describe("truthful manual and watch mailbox health", () => {
  it.each([
    { label: "no state", state: null, health: "manual" },
    { label: "fresh manual refresh", state: {}, health: "connected" },
    {
      label: "unresolved watch expiry",
      state: { health: "watching" },
      health: "degraded",
    },
    {
      label: "fresh current watch",
      state: { health: "watching", watch_expiration_ms: now + day },
      health: "watching",
    },
    {
      label: "expired historical watch",
      state: { watch_expiration_ms: now - 1 },
      health: "degraded",
    },
    {
      label: "stale manual sync",
      state: { last_successful_sync_ms: now - day - 1 },
      health: "degraded",
    },
    {
      label: "unknown sync time",
      state: { last_successful_sync_ms: undefined },
      health: "degraded",
    },
    {
      label: "unfinished resync",
      state: { health: "degraded", linked_resync_after: "synthetic-cursor" },
      health: "degraded",
    },
  ] as { label: string; state: Partial<GmailMailboxState> | null; health: string }[])(
    "reports $label without a watch mutation or mailbox write",
    async ({ state, health }) => {
      const { hub, store, transport } = fixture(state);
      const before = structuredClone([...store.mailboxStates]);
      await expect(hub.connection()).resolves.toMatchObject({
        status: "connected",
        mailboxEmail: actor.email,
        sync: { health, watchExpirationMs: state?.watch_expiration_ms ?? null },
      });
      expect([...store.mailboxStates]).toEqual(before);
      expect(transport.send).not.toHaveBeenCalled();
    },
  );
});
