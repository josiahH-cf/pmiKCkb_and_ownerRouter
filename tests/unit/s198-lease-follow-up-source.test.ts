import { beforeEach, afterEach, it, expect, vi } from "vitest";
const fake = vi.hoisted(() => ({
  views: [] as Array<Record<string, unknown>>,
  complete: true,
  review: null,
  material: { state: "none", active: null, pendingVersions: [], activeRevision: null },
}));
vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: {} }),
}));
vi.mock("@/lib/firestore/renewal-notice-safety", () => ({
  withRenewalNoticeAdmission: () => ({}),
}));
vi.mock("@/lib/lease-renewal/live-lease-cache", () => ({
  requireCurrentLeaseViews: async () => {
    if (!fake.complete) throw new Error("Complete source unavailable");
    return fake.views;
  },
}));
vi.mock("@/lib/firestore/lease-renewal-term-reviews", () => ({
  getLeaseTermReview: async () => fake.review,
}));
vi.mock("@/lib/firestore/lease-renewal-policy-material", () => ({
  readPolicyMaterialSnapshot: async () => fake.material,
}));
import { resolveLeaseFollowUpSource } from "@/lib/work-accountability/lease-follow-up-source";
import { LeaseFollowUpInputSchema } from "@/lib/work-accountability/lease-follow-up";
import type { Firestore } from "firebase-admin/firestore";
const actor = {
    uid: "editor",
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor" as const,
  },
  db = {} as Firestore;
beforeEach(() => {
  fake.complete = true;
  fake.views = [{ leaseID: "115", endDate: "2026-12-31" }];
});
afterEach(() => vi.unstubAllGlobals());
it("accepts exactly one current source identity and refuses duplicates, missing identities and partial exports", async () => {
  const result = await resolveLeaseFollowUpSource(actor, "115", db);
  expect(result).toMatchObject({
    leaseId: "115",
    basis: { kind: "lease_end", dateIso: "2026-12-31" },
    source: { id: "115", status: "verified" },
    policyContext: { material_state: "none", applicability: "unverified" },
  });
  fake.views.push({ ...fake.views[0] });
  await expect(resolveLeaseFollowUpSource(actor, "115", db)).rejects.toThrow(
    /missing or ambiguous/,
  );
  fake.views = [];
  await expect(resolveLeaseFollowUpSource(actor, "115", db)).rejects.toThrow(
    /missing or ambiguous/,
  );
  fake.complete = false;
  await expect(resolveLeaseFollowUpSource(actor, "115", db)).rejects.toThrow(
    /Complete source/,
  );
});
it("does not derive a cycle or policy applicability from missing dates or client-provided authority", async () => {
  fake.views = [{ leaseID: "115" }];
  expect((await resolveLeaseFollowUpSource(actor, "115", db)).basis).toBeNull();
  const base = {
    lease_id: "115",
    expected_cycle_key: "lease_end:2026-12-31",
    kind: "rhino",
    title: "Review actual evidence",
    next_action: "Check material",
    idempotency_key: "fixture-op",
  };
  expect(
    LeaseFollowUpInputSchema.safeParse({ ...base, verified_coverage: true }).success,
  ).toBe(false);
  for (const key of [
    "lease_end:2026-02-30",
    "lease_end:2026-12-31:extra",
    "recorded_cycle:------------------------------------",
  ]) {
    expect(
      LeaseFollowUpInputSchema.safeParse({ ...base, expected_cycle_key: key }).success,
    ).toBe(false);
  }
});
