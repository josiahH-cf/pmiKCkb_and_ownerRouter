import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  SPACE_REQUESTS_COLLECTION,
  createSpaceRequest,
  listSpaceRequests,
} from "@/lib/firestore/space-requests";

// Minimal in-memory Firestore double. createSpaceRequest uses collection().doc().set()/get(); listing
// uses collection().get(). A per-write counter stamps an increasing created_at so newest-first sort is
// deterministic (Date.now() is unavailable in this harness by design).
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
      doc: (id: string) => {
        const path = `${name}/${id}`;
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

describe("space-requests store", () => {
  it("records an Admin request, derives the slug, and reads it back", async () => {
    const db = new TestFirestore();
    const saved = await createSpaceRequest(
      admin,
      {
        name: "Owner Statements",
        scope: "Monthly owner statements to owners",
        intendedSources: ["Drive: owner-statement SOPs"],
      },
      db as unknown as Firestore,
    );

    expect(saved).toMatchObject({
      name: "Owner Statements",
      spaceId: "owner-statements",
      scope: "Monthly owner statements to owners",
      intendedSources: ["Drive: owner-statement SOPs"],
      status: "requested",
      requestedByUid: "admin-1",
    });
    expect(saved.createdAt).toBeTruthy();

    // Persisted snake_case.
    const record = [...db.store.values()][0];
    expect(record).toMatchObject({
      space_id: "owner-statements",
      requested_by_uid: "admin-1",
      status: "requested",
    });
  });

  it("refuses a non-Admin (Editor) with a 403 and writes nothing", async () => {
    const db = new TestFirestore();
    await expect(
      createSpaceRequest(
        editor,
        { name: "Blocked Space", scope: "should not persist", intendedSources: [] },
        db as unknown as Firestore,
      ),
    ).rejects.toThrow();
    expect(db.store.size).toBe(0);
    await expect(
      listSpaceRequests(editor, db as unknown as Firestore),
    ).rejects.toThrow();
  });

  it("rejects a too-short name via the input schema", async () => {
    const db = new TestFirestore();
    await expect(
      createSpaceRequest(
        admin,
        { name: "A", scope: "too short a name", intendedSources: [] },
        db as unknown as Firestore,
      ),
    ).rejects.toThrow();
  });

  it("lists requests newest-first", async () => {
    const db = new TestFirestore();
    await createSpaceRequest(
      admin,
      { name: "First Space", scope: "the first one", intendedSources: [] },
      db as unknown as Firestore,
    );
    await createSpaceRequest(
      admin,
      { name: "Second Space", scope: "the second one", intendedSources: [] },
      db as unknown as Firestore,
    );
    const requests = await listSpaceRequests(admin, db as unknown as Firestore);
    expect(requests.map((request) => request.name)).toEqual([
      "Second Space",
      "First Space",
    ]);
    expect(SPACE_REQUESTS_COLLECTION).toBe("space_requests");
  });
});
