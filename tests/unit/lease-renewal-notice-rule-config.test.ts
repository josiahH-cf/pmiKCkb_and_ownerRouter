import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  NOTICE_RULE_CONFIG_DOC_ID,
  buildNoticeRuleConfigRecord,
  readNoticeRuleConfigRecord,
  readNoticeRuleSet,
  seedNoticeRuleConfig,
  updateNoticeRuleConfig,
} from "@/lib/firestore/lease-renewal-notice-rules";
import type { SeedFirestore } from "@/lib/lease-renewal/process-definition-seed";
import { FakeFirestore } from "../helpers/fake-firestore";

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

describe("notice rule admin edit surface (F-TMPL-5)", () => {
  const admin: AuthenticatedUser = {
    uid: "admin-1",
    email: "admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin",
  };
  const editor: AuthenticatedUser = { ...admin, uid: "editor-1", role: "Editor" };
  const confirmedGlobal = {
    scope: "global" as const,
    values: {
      noticeDeadlineDayOfMonth: 15,
      noticeDeadlineMonthOffset: -2,
      operatorWarningLeadDays: 10,
      followUpIntervalDays: 7,
      enabled: true,
    },
    verified: true,
  };

  it("returns the unverified default baseline for an Admin before anything is saved", async () => {
    const db = new FakeFirestore() as unknown as Firestore;
    const record = await readNoticeRuleConfigRecord(admin, db);
    expect(record.rules[0]).toMatchObject({ scope: "global", verified: false });
    expect(record.created_at).toBe("default");
  });

  it("denies non-Admins from reading or updating the rules", async () => {
    const db = new FakeFirestore() as unknown as Firestore;
    await expect(readNoticeRuleConfigRecord(editor, db)).rejects.toBeInstanceOf(
      EditableLayerError,
    );
    await expect(
      updateNoticeRuleConfig(editor, { rules: [confirmedGlobal] }, db),
    ).rejects.toBeInstanceOf(EditableLayerError);
  });

  it("persists an Admin confirmation, stamps updated_by_uid, and preserves created_at", async () => {
    const db = new FakeFirestore() as unknown as Firestore;

    const first = await updateNoticeRuleConfig(
      admin,
      { rules: [confirmedGlobal] },
      db,
      "2026-07-10T00:00:00.000Z",
    );
    expect(first).toMatchObject({
      updated_by_uid: "admin-1",
      created_at: "2026-07-10T00:00:00.000Z",
      updated_at: "2026-07-10T00:00:00.000Z",
    });
    expect(first.rules[0].verified).toBe(true);

    const second = await updateNoticeRuleConfig(
      admin,
      { rules: [{ ...confirmedGlobal, verified: false }] },
      db,
      "2026-07-11T00:00:00.000Z",
    );
    // Second edit keeps created_at, re-stamps updated_at.
    expect(second.created_at).toBe("2026-07-10T00:00:00.000Z");
    expect(second.updated_at).toBe("2026-07-11T00:00:00.000Z");
    expect(second.rules[0].verified).toBe(false);
  });

  it("makes the engine resolve a confirmed global rule (clears Needs Verification)", async () => {
    const db = new FakeFirestore() as unknown as Firestore;
    await updateNoticeRuleConfig(
      admin,
      { rules: [confirmedGlobal] },
      db,
      "2026-07-10T00:00:00.000Z",
    );
    const ruleSet = await readNoticeRuleSet(db);
    expect(ruleSet.rules[0]).toMatchObject({ scope: "global", verified: true });
  });
});
