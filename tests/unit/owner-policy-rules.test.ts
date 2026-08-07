// S62 rule store: Admin-only with a required reason and an append-only audit (AC-S62-8); a rule
// can only key on a portfolio id that resolves against a live lease view — free-text owner names
// are refused (AC-S62-11); only past-effective rules apply.

import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  getActiveOwnerPolicyRule,
  listOwnerPolicyRules,
  OWNER_POLICY_RULE_COLLECTIONS,
  upsertOwnerPolicyRule,
} from "@/lib/firestore/owner-policy-rules";
import { FakeFirestore } from "../helpers/fake-firestore";

function userWith(role: Role, uid: string): AuthenticatedUser {
  return { uid, email: `${uid}@example.com`, hd: "example.com", role };
}

const admin = userWith("Admin", "admin-1");
const editor = userWith("Editor", "editor-1");

const VALID = {
  portfolioId: "27",
  percent: 3.5,
  effectiveFrom: "2026-08-01",
  note: "MKD standing agreement: 3.5% every renewal until told otherwise.",
  reason: "Recorded from the 2026-08-05 client call, owner-approved.",
};

let db: FakeFirestore;
const resolves = vi.fn(async () => true);

beforeEach(() => {
  db = new FakeFirestore();
  resolves.mockClear().mockResolvedValue(true);
});
const fs = () => db as unknown as Firestore;

describe("upsertOwnerPolicyRule", () => {
  it("creates the rule with an append-only audit entry carrying the reason", async () => {
    const rule = await upsertOwnerPolicyRule(admin, VALID, resolves, fs());
    expect(rule).toMatchObject({
      portfolioId: "27",
      kind: "flat_percent_increase",
      percent: 3.5,
      effectiveFrom: "2026-08-01",
    });
    const activity = [...db.store.entries()].filter(([path]) =>
      path.startsWith(`${OWNER_POLICY_RULE_COLLECTIONS.activity}/`),
    );
    expect(activity).toHaveLength(1);
    expect(activity[0][1]).toMatchObject({
      portfolio_id: "27",
      action: "create",
      reason: VALID.reason,
    });
  });

  it("audits an update as its own append-only entry", async () => {
    await upsertOwnerPolicyRule(admin, VALID, resolves, fs());
    await upsertOwnerPolicyRule(
      admin,
      { ...VALID, percent: 4, reason: "Owner raised the standing increase." },
      resolves,
      fs(),
    );
    const activity = [...db.store.entries()].filter(([path]) =>
      path.startsWith(`${OWNER_POLICY_RULE_COLLECTIONS.activity}/`),
    );
    expect(activity).toHaveLength(2);
    expect(activity.map(([, record]) => record.action).sort()).toEqual([
      "create",
      "update",
    ]);
  });

  // AC-S62-8: Admin-only; a non-Admin attempt is refused and writes nothing.
  it("refuses a non-Admin and writes nothing", async () => {
    await expect(upsertOwnerPolicyRule(editor, VALID, resolves, fs())).rejects.toThrow(
      EditableLayerError,
    );
    expect(db.store.size).toBe(0);
  });

  it("requires a plain-English reason and note", async () => {
    await expect(
      upsertOwnerPolicyRule(admin, { ...VALID, reason: "  " }, resolves, fs()),
    ).rejects.toThrow(/reason/i);
    await expect(
      upsertOwnerPolicyRule(admin, { ...VALID, note: "" }, resolves, fs()),
    ).rejects.toThrow(/note/i);
  });

  // AC-S62-11: a free-text owner name is refused; an unresolvable id is refused.
  it("refuses a free-text owner name as the key", async () => {
    await expect(
      upsertOwnerPolicyRule(admin, { ...VALID, portfolioId: "MKD" }, resolves, fs()),
    ).rejects.toThrow(/numeric RentVine portfolio id/i);
    expect(resolves).not.toHaveBeenCalled();
  });

  it("refuses a portfolio id that does not resolve against a live lease view", async () => {
    resolves.mockResolvedValue(false);
    await expect(upsertOwnerPolicyRule(admin, VALID, resolves, fs())).rejects.toThrow(
      /does not resolve/i,
    );
    expect(db.store.size).toBe(0);
  });

  it("bounds the percentage to a sane positive range", async () => {
    for (const percent of [0, -3.5, 101, Number.NaN]) {
      await expect(
        upsertOwnerPolicyRule(admin, { ...VALID, percent }, resolves, fs()),
      ).rejects.toThrow(/percentage/i);
    }
  });
});

describe("getActiveOwnerPolicyRule", () => {
  it("returns the rule once its effective-from date has passed", async () => {
    await upsertOwnerPolicyRule(admin, VALID, resolves, fs());
    const active = await getActiveOwnerPolicyRule(admin, "27", "2026-08-06", fs());
    expect(active?.percent).toBe(3.5);
  });

  it("never applies a future-dated rule", async () => {
    await upsertOwnerPolicyRule(
      admin,
      { ...VALID, effectiveFrom: "2027-01-01" },
      resolves,
      fs(),
    );
    expect(await getActiveOwnerPolicyRule(admin, "27", "2026-08-06", fs())).toBeNull();
    // Admins still see it in the management list.
    expect(await listOwnerPolicyRules(admin, fs())).toHaveLength(1);
  });

  it("returns null for an unknown portfolio and a malformed id", async () => {
    expect(await getActiveOwnerPolicyRule(admin, "99", "2026-08-06", fs())).toBeNull();
    expect(await getActiveOwnerPolicyRule(admin, "MKD", "2026-08-06", fs())).toBeNull();
  });
});
