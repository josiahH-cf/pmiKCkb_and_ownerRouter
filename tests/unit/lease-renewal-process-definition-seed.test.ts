import { describe, expect, it } from "vitest";

import { LEASE_RENEWAL_STAGES } from "@/lib/lease-renewal/constants";
import {
  LEASE_RENEWAL_DEFINITION_ID,
  assertNoExecutableReferences,
  buildLeaseRenewalDefinitionRecord,
  seedLeaseRenewalDefinition,
  type SeedFirestore,
} from "@/lib/lease-renewal/process-definition-seed";

const OPTS = { ownerUid: "owner-1", approverUid: "approver-1" };

function fakeFirestore() {
  const store = new Map<string, Record<string, unknown>>();
  const db: SeedFirestore = {
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`;
          return {
            async get() {
              const data = store.get(key);
              return { exists: data !== undefined, data: () => data };
            },
            async set(data: Record<string, unknown>) {
              store.set(key, data);
            },
          };
        },
      };
    },
  };
  return { db, store, key: `process_definitions/${LEASE_RENEWAL_DEFINITION_ID}` };
}

describe("buildLeaseRenewalDefinitionRecord", () => {
  it("builds a Draft at the fixed id with normalized steps + non-executable references", () => {
    const record = buildLeaseRenewalDefinitionRecord(OPTS);

    expect(record.id).toBe(LEASE_RENEWAL_DEFINITION_ID);
    expect(record.status).toBe("Draft");
    expect(record.steps.map((step) => step.title)).toEqual([...LEASE_RENEWAL_STAGES]);
    expect(record.steps[0].id).toBe("step-1");
    expect(record.action_references.length).toBeGreaterThanOrEqual(6);
    expect(record.action_references[0].id).toBe("action-1");
    expect(
      record.action_references.some((ref) => ref.readiness === "Approved for Execution"),
    ).toBe(false);
    // The builder is pure: the writer stamps timestamps, not the builder.
    expect("created_at" in record).toBe(false);
    expect("updated_at" in record).toBe(false);
  });
});

describe("assertNoExecutableReferences", () => {
  it("throws when any reference is Approved for Execution", () => {
    const record = buildLeaseRenewalDefinitionRecord(OPTS);
    const tainted = {
      ...record,
      action_references: [
        { ...record.action_references[0], readiness: "Approved for Execution" as const },
      ],
    };
    expect(() => assertNoExecutableReferences(tainted)).toThrow(/Approved for Execution/);
  });
});

describe("seedLeaseRenewalDefinition", () => {
  it("creates, skips on re-run, and updates on force while preserving created_at", async () => {
    const { db, store, key } = fakeFirestore();

    const first = await seedLeaseRenewalDefinition({
      db,
      ...OPTS,
      now: "2026-06-29T00:00:00.000Z",
    });
    expect(first.action).toBe("created");
    expect(store.get(key)?.created_at).toBe("2026-06-29T00:00:00.000Z");

    const second = await seedLeaseRenewalDefinition({
      db,
      ...OPTS,
      now: "2026-07-01T00:00:00.000Z",
    });
    expect(second.action).toBe("skipped");
    expect(store.get(key)?.created_at).toBe("2026-06-29T00:00:00.000Z");

    const forced = await seedLeaseRenewalDefinition({
      db,
      ...OPTS,
      force: true,
      now: "2026-07-02T00:00:00.000Z",
    });
    expect(forced.action).toBe("updated");
    expect(store.get(key)?.created_at).toBe("2026-06-29T00:00:00.000Z");
    expect(store.get(key)?.updated_at).toBe("2026-07-02T00:00:00.000Z");
  });
});
