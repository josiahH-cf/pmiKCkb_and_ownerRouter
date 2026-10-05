import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
  getRenewalDeskPreference,
  saveRenewalDeskPreference,
} from "@/lib/firestore/renewal-desk-preferences";
const actor = {
  uid: "fixture-editor",
  email: "fixture-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
describe("S177 server ordering of deliberate views", () => {
  it("does not let the slow older save overwrite the newest admitted preference", async () => {
    let value: unknown;
    let finish!: () => void;
    let version = 0;
    let attempts = 0;
    const doc = { get: async () => ({ exists: Boolean(value), data: () => value }) };
    const fake = {
      collection: () => ({ doc: () => doc }),
      async runTransaction(
        work: (tx: {
          get: typeof doc.get;
          set: (ref: unknown, next: unknown) => void;
        }) => Promise<unknown>,
      ): Promise<unknown> {
        const start = version;
        const attempt = ++attempts;
        let next: unknown;
        const result = await work({
          get: doc.get,
          set: (_, data) => {
            next = data;
          },
        });
        if (attempt === 1)
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
        // The Admin SDK retries a transaction whose read version changed before commit.
        if (version !== start) return fake.runTransaction(work);
        value = next;
        version++;
        return result;
      },
    };
    const db = fake as unknown as Firestore;
    const old = saveRenewalDeskPreference(
      actor,
      { query: "v=2&scope=all", expectedRevision: 0 },
      db,
    );
    const refused = expect(old).rejects.toMatchObject({ status: 409 });
    for (let i = 0; i < 10 && !finish; i++) await Promise.resolve();
    await saveRenewalDeskPreference(
      actor,
      { query: "v=2&sort=end_date&direction=desc", expectedRevision: 0 },
      db,
    );
    finish();
    await refused;
    expect((await getRenewalDeskPreference(actor, db))?.view).toBe(
      "v=2&sort=end_date&direction=desc",
    );
  });
});
