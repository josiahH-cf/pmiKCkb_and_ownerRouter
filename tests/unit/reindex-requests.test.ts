import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  REINDEX_REQUESTS_COLLECTION,
  createReindexRequest,
  listReindexRequests,
} from "@/lib/firestore/reindex-requests";

let clock = 0;
function resolveSentinels(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    (value as { constructor?: { name?: string } }).constructor?.name ===
      "ServerTimestampTransform"
  ) {
    clock += 1;
    return `2026-07-22T12:00:0${clock}.000Z`;
  }
  return value;
}

class TestFirestore {
  readonly store = new Map<string, Record<string, unknown>>();
  collection(name: string) {
    const store = this.store;
    return {
      doc: (docId: string) => {
        const path = `${name}/${docId}`;
        return {
          set: async (data: Record<string, unknown>) => {
            store.set(
              path,
              Object.fromEntries(
                Object.entries(data).map(([key, val]) => [key, resolveSentinels(val)]),
              ),
            );
          },
          get: async () => ({ data: () => store.get(path) }),
        };
      },
      get: async () => ({
        docs: [...store.entries()]
          .filter(([path]) => path.startsWith(`${name}/`))
          .map(([, data]) => ({ data: () => data })),
      }),
    };
  }
}

const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const editor: AuthenticatedUser = { ...admin, uid: "editor-1", role: "Editor" };

describe("reindex-requests store", () => {
  it("records a confirmed Admin request and reads it back", async () => {
    const db = new TestFirestore();
    const saved = await createReindexRequest(
      admin,
      { spaceId: "lease-renewals", confirm: true },
      db as unknown as Firestore,
    );
    expect(saved).toMatchObject({
      spaceId: "lease-renewals",
      status: "requested",
      requestedByUid: "admin-1",
    });
    expect(saved.createdAt).toBeTruthy();
    expect(REINDEX_REQUESTS_COLLECTION).toBe("reindex_requests");
  });

  it("refuses without an explicit confirm:true (the cost gate) and writes nothing", async () => {
    const db = new TestFirestore();
    await expect(
      createReindexRequest(
        admin,
        { spaceId: "lease-renewals", confirm: false } as never,
        db as unknown as Firestore,
      ),
    ).rejects.toThrow();
    await expect(
      createReindexRequest(
        admin,
        { spaceId: "lease-renewals" } as never,
        db as unknown as Firestore,
      ),
    ).rejects.toThrow();
    expect(db.store.size).toBe(0);
  });

  it("refuses a non-Admin (Editor) with a 403", async () => {
    const db = new TestFirestore();
    await expect(
      createReindexRequest(
        editor,
        { spaceId: "lease-renewals", confirm: true },
        db as unknown as Firestore,
      ),
    ).rejects.toThrow();
    await expect(
      listReindexRequests(editor, db as unknown as Firestore),
    ).rejects.toThrow();
    expect(db.store.size).toBe(0);
  });

  it("lists requests newest-first", async () => {
    const db = new TestFirestore();
    await createReindexRequest(
      admin,
      { spaceId: "space-a", confirm: true },
      db as unknown as Firestore,
    );
    await createReindexRequest(
      admin,
      { spaceId: "space-b", confirm: true },
      db as unknown as Firestore,
    );
    const requests = await listReindexRequests(admin, db as unknown as Firestore);
    expect(requests.map((request) => request.spaceId)).toEqual(["space-b", "space-a"]);
  });
});
