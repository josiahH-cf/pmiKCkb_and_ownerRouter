import { describe, expect, it } from "vitest";

import type { SeedFirestore } from "@/lib/lease-renewal/process-definition-seed";
import { MAINTENANCE_STAGES } from "@/lib/maintenance/constants";
import {
  MAINTENANCE_DEFINITION_ID,
  buildMaintenanceDefinitionRecord,
  seedMaintenanceDefinition,
} from "@/lib/maintenance/process-definition-seed";

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
  return { db, store, key: `process_definitions/${MAINTENANCE_DEFINITION_ID}` };
}

describe("buildMaintenanceDefinitionRecord", () => {
  it("builds a Draft at the fixed id with normalized steps + non-executable references", () => {
    const record = buildMaintenanceDefinitionRecord(OPTS);

    expect(record.id).toBe(MAINTENANCE_DEFINITION_ID);
    expect(record.status).toBe("Draft");
    expect(record.steps.map((step) => step.title)).toEqual([...MAINTENANCE_STAGES]);
    expect(record.steps[0].id).toBe("step-1");
    expect(
      record.action_references.some((ref) => ref.readiness === "Approved for Execution"),
    ).toBe(false);
    expect("created_at" in record).toBe(false);
  });
});

describe("seedMaintenanceDefinition", () => {
  it("creates, skips on re-run, and force-updates while preserving created_at", async () => {
    const { db, store, key } = fakeFirestore();

    const first = await seedMaintenanceDefinition({
      db,
      ...OPTS,
      now: "2026-06-29T00:00:00.000Z",
    });
    expect(first.action).toBe("created");
    expect(store.get(key)?.created_at).toBe("2026-06-29T00:00:00.000Z");

    const second = await seedMaintenanceDefinition({
      db,
      ...OPTS,
      now: "2026-07-01T00:00:00.000Z",
    });
    expect(second.action).toBe("skipped");

    const forced = await seedMaintenanceDefinition({
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
