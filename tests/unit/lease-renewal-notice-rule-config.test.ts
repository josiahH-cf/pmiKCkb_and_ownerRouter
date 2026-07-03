import { describe, expect, it } from "vitest";

import {
  NOTICE_RULE_CONFIG_DOC_ID,
  buildNoticeRuleConfigRecord,
  seedNoticeRuleConfig,
} from "@/lib/firestore/lease-renewal-notice-rules";
import type { SeedFirestore } from "@/lib/lease-renewal/process-definition-seed";

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
  return { db, store, key: `lease_renewal_notice_rules/${NOTICE_RULE_CONFIG_DOC_ID}` };
}

describe("buildNoticeRuleConfigRecord", () => {
  it("builds the default rule set at the fixed id, unverified, no timestamps", () => {
    const record = buildNoticeRuleConfigRecord({ seededByUid: "owner-1" });
    expect(record.id).toBe(NOTICE_RULE_CONFIG_DOC_ID);
    expect(record.rules).toHaveLength(1);
    expect(record.rules[0].scope).toBe("global");
    expect(record.rules[0].verified).toBe(false);
    expect(record.rules[0].values.noticeDeadlineDayOfMonth).toBe(15);
    expect("created_at" in record).toBe(false);
    expect("updated_at" in record).toBe(false);
  });
});

describe("seedNoticeRuleConfig", () => {
  it("creates, skips on re-run, and updates on force while preserving created_at", async () => {
    const { db, store, key } = fakeFirestore();
    const record = buildNoticeRuleConfigRecord({ seededByUid: "owner-1" });

    const first = await seedNoticeRuleConfig({
      db,
      record,
      now: "2026-07-02T00:00:00.000Z",
    });
    expect(first.action).toBe("created");
    expect(store.get(key)?.created_at).toBe("2026-07-02T00:00:00.000Z");

    const second = await seedNoticeRuleConfig({
      db,
      record,
      now: "2026-07-03T00:00:00.000Z",
    });
    expect(second.action).toBe("skipped");
    expect(store.get(key)?.created_at).toBe("2026-07-02T00:00:00.000Z");

    const forced = await seedNoticeRuleConfig({
      db,
      record,
      force: true,
      now: "2026-07-04T00:00:00.000Z",
    });
    expect(forced.action).toBe("updated");
    expect(store.get(key)?.created_at).toBe("2026-07-02T00:00:00.000Z");
    expect(store.get(key)?.updated_at).toBe("2026-07-04T00:00:00.000Z");
  });

  it("rejects an out-of-range value before writing", async () => {
    const { db } = fakeFirestore();
    const record = buildNoticeRuleConfigRecord({ seededByUid: "owner-1" });
    const tainted = {
      ...record,
      rules: [{ ...record.rules[0], values: { noticeDeadlineDayOfMonth: 44 } }],
    };
    await expect(
      seedNoticeRuleConfig({ db, record: tainted, now: "2026-07-02T00:00:00.000Z" }),
    ).rejects.toThrow();
  });
});
