import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { DEFAULT_OWNER_TRANSACTIONAL_EMAIL } from "@/lib/constants";
import {
  defaultOwnerTransactionalDestination,
  readOwnerTransactionalDestination,
  updateOwnerTransactionalDestination,
} from "@/lib/firestore/owner-transactional-destination";

// A minimal in-memory Firestore double: only the doc().get()/set() surface this lib touches.
function fakeDb(initial?: Record<string, unknown>) {
  const store = new Map<string, Record<string, unknown>>();
  if (initial) store.set("owner_transactional_destination/default", initial);
  return {
    collection: (collection: string) => ({
      doc: (doc: string) => {
        const key = `${collection}/${doc}`;
        return {
          get: async () => ({ id: doc, data: () => store.get(key) }),
          set: async (value: Record<string, unknown>) => {
            store.set(key, value);
          },
        };
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function user(role: AuthenticatedUser["role"], uid = "admin-1"): AuthenticatedUser {
  return { email: `${uid}@pmikcmetro.com`, hd: "pmikcmetro.com", role, uid };
}

describe("owner transactional destination store", () => {
  it("defaults to the seeded owner address", () => {
    expect(defaultOwnerTransactionalDestination().destination_email).toBe(
      DEFAULT_OWNER_TRANSACTIONAL_EMAIL,
    );
  });

  it("returns the seeded default when no override doc exists", async () => {
    const record = await readOwnerTransactionalDestination(user("Admin"), fakeDb());
    expect(record.destination_email).toBe(DEFAULT_OWNER_TRANSACTIONAL_EMAIL);
    expect(record.updated_at).toBe("default");
  });

  it("persists an Admin edit, lowercasing and stamping the actor", async () => {
    const db = fakeDb();
    const saved = await updateOwnerTransactionalDestination(
      user("Admin", "admin-7"),
      { destination_email: "Owner@Example.COM" },
      db,
    );
    expect(saved.destination_email).toBe("owner@example.com");
    expect(saved.updated_by_uid).toBe("admin-7");

    const readBack = await readOwnerTransactionalDestination(user("Admin"), db);
    expect(readBack.destination_email).toBe("owner@example.com");
  });

  it("converts a stored Firestore timestamp to an ISO string on read", async () => {
    const db = fakeDb({
      destination_email: "team@pmikcmetro.com",
      updated_at: { toDate: () => new Date("2026-01-02T03:04:05.000Z") },
      updated_by_uid: "admin-2",
    });
    const record = await readOwnerTransactionalDestination(user("Admin"), db);
    expect(record.updated_at).toBe("2026-01-02T03:04:05.000Z");
    expect(record.updated_by_uid).toBe("admin-2");
  });

  it("rejects a non-Admin reader and writer with 403", async () => {
    await expect(
      readOwnerTransactionalDestination(user("Editor"), fakeDb()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      updateOwnerTransactionalDestination(
        user("Editor"),
        { destination_email: "x@pmikcmetro.com" },
        fakeDb(),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects an invalid email at the store boundary", async () => {
    await expect(
      updateOwnerTransactionalDestination(
        user("Admin"),
        { destination_email: "not-an-email" } as never,
        fakeDb(),
      ),
    ).rejects.toBeInstanceOf(Error);
  });
});
