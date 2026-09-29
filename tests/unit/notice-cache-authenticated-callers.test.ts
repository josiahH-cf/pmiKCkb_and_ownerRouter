import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import { readAdmittedRenewalNoticeLease } from "@/lib/lease-renewal/admitted-notice-source";
import { reserveRenewalNoticeLease } from "@/lib/firestore/renewal-notice-safety";
import { renewalWorkspaceDocId } from "@/lib/firestore/renewal-workspace";

const fixture = vi.hoisted(() => ({
  db: undefined as unknown,
  reader: undefined as unknown,
}));
const actor: AuthenticatedUser = {
  uid: "synthetic-cache-reader",
  email: "synthetic-cache-reader@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => fixture.db }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: async () => actor,
  requireCapability: async () => actor,
}));
vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: fixture.reader }),
}));
vi.mock("@/lib/firestore/lease-renewal-rent-suggestion-approvals", async (original) => ({
  ...(await original<
    typeof import("@/lib/firestore/lease-renewal-rent-suggestion-approvals")
  >()),
  resolveLeaseRentSuggestion: async () => ({ status: "unavailable" }),
  getRentSuggestionApproval: async () => null,
  listRentSuggestionApprovalActivity: async () => [],
}));
vi.mock("@/lib/firestore/owner-policy-rules", () => ({
  listOwnerPolicyRules: async () => [],
  upsertOwnerPolicyRule: async (
    _actor: unknown,
    input: { portfolioId: string },
    resolves: (id: string) => Promise<boolean>,
  ) => ({ resolved: await resolves(input.portfolioId) }),
}));
vi.mock("@/lib/operations/runtime-suspension-gate", () => ({
  isProductionRuntimeActionExecutable: async () => false,
}));

import { GET as rentSuggestion } from "@/app/api/lease-renewal/rent-suggestion/route";
import { POST as policyRule } from "@/app/api/admin/owner-policy-rules/route";
import { POST as askTarget } from "@/app/api/ask/live-target/route";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const db = new FakeTransactionalFirestore();
  const reader = {
    listAllLeasesExport: vi.fn(async () => ({
      rows: [{ lease: { leaseID: "9001" }, unit: { portfolioID: "9010" } }],
      pages: 1,
      complete: true,
    })),
    listLeaseStatuses: vi.fn(async () => []),
  };
  fixture.db = db;
  fixture.reader = reader;
  return { db, reader };
}
beforeEach(() => {
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
});

describe("authenticated ordinary cache producers retain notice admission", () => {
  it.each(["not-a-lease", "0", "-1", "1/notice"])(
    "does not reserve or fetch an invalid lease id %s",
    async (leaseId) => {
      const { db, reader } = setup();
      const response = await rentSuggestion(
        new Request(
          `http://localhost/api/lease-renewal/rent-suggestion?lease_id=${encodeURIComponent(leaseId)}`,
        ),
      );
      expect(response.status).toBe(200);
      expect(db.store.size).toBe(0);
      expect(reader.listAllLeasesExport).not.toHaveBeenCalled();
      expect(reader.listLeaseStatuses).not.toHaveBeenCalled();
    },
  );

  it("lets a notice join the first rent-suggestion GET without a second portfolio export", async () => {
    const { db, reader } = setup(),
      entered = deferred(),
      release = deferred();
    const original = reader.listAllLeasesExport.getMockImplementation()!;
    reader.listAllLeasesExport.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      return original();
    });
    const ordinary = rentSuggestion(
      new Request("http://localhost/api/lease-renewal/rent-suggestion?lease_id=9001"),
    );
    await entered.promise;
    const admitted = readAdmittedRenewalNoticeLease(
      actor,
      "9001",
      reader,
      Date.now(),
      db as unknown as Firestore,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    release.resolve();
    const [response, result] = await Promise.all([ordinary, admitted]);
    expect(response.status).toBe(200);
    expect(result.snapshot.noticeAdmission?.leaseKeys).toContain(
      renewalWorkspaceDocId("9001"),
    );
    expect(reader.listAllLeasesExport).toHaveBeenCalledTimes(1);
    expect(reader.listLeaseStatuses).toHaveBeenCalledTimes(1);
  });

  it.each(["owner_policy", "ask_target"] as const)(
    "%s journals existing lease markers before its portfolio read",
    async (kind) => {
      const { db, reader } = setup();
      await reserveRenewalNoticeLease(actor, "9001", db as unknown as Firestore);
      const path = `lease_renewal_workspaces/${renewalWorkspaceDocId("9001")}/approval_safety/notice`;
      const original = reader.listAllLeasesExport.getMockImplementation()!;
      let admittedBeforeFetch = false;
      reader.listAllLeasesExport.mockImplementationOnce(async () => {
        admittedBeforeFetch = (db.read(path)?.version as number) > 1;
        return original();
      });
      const response =
        kind === "owner_policy"
          ? await policyRule(
              new Request("http://localhost/api/admin/owner-policy-rules", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  portfolioId: "9010",
                  percent: 2,
                  effectiveFrom: "2026-10-01",
                  note: "Synthetic rule",
                  reason: "Synthetic test",
                }),
              }),
            )
          : await askTarget(
              new Request("http://localhost/api/ask/live-target", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ question: "Synthetic unmatched target" }),
              }),
            );
      expect(response.status).toBe(200);
      expect(reader.listAllLeasesExport).toHaveBeenCalledTimes(1);
      expect(admittedBeforeFetch).toBe(true);
    },
  );
});
