import { describe, expect, it } from "vitest";

import { FakeTransactionalFirestore } from "@/tests/helpers/fake-transactional-firestore";

describe("FakeTransactionalFirestore optimistic transactions", () => {
  it("retries one overlapping callback instead of serializing both callbacks", async () => {
    const fake = new FakeTransactionalFirestore();
    fake.seed("counters/main", { value: 0 });
    fake.armNextCommitBarrier(2);
    let callbackRuns = 0;

    const increment = () =>
      fake.runTransaction(async (transaction) => {
        callbackRuns += 1;
        const ref = fake.collection("counters").doc("main");
        const snapshot = (await transaction.get(ref)) as {
          data(): Record<string, unknown> | undefined;
        };
        const value = Number(snapshot.data()?.value);
        transaction.set(ref, { value: value + 1 });
        return value;
      });

    const observed = await Promise.all([increment(), increment()]);

    expect(observed.sort()).toEqual([0, 1]);
    expect(callbackRuns).toBe(3);
    expect(fake.read("counters/main")).toEqual({ value: 2 });
  });
});
