import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import {
  createPartyFilterResolver,
  readPartyFilterKeyConfig,
} from "@/lib/lease-renewal/party-filter-key";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  applyRenewalDeskQueryV2,
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
  type RenewalDeskV2Item,
} from "@/lib/lease-renewal/desk-query-v2";
import { resolveRenewalDeskEntry } from "@/lib/lease-renewal/desk-preferences";
const config = readPartyFilterKeyConfig({
  RENEWAL_DESK_PARTY_FILTER_KEY: randomBytes(32).toString("base64url"),
});
function item(id: string, ownerId: string, nonRenewal = false): RenewalDeskV2Item {
  return {
    id,
    identity: { address: { label: `Synthetic ${id}` }, property: null },
    retention: { state: "window" },
    guidance: {
      currentBaseRent: 1000,
      rentVerification: { state: "verified" },
      overallStatus: "ready",
      urgencyRank: 3,
      isBlocked: false,
    },
    queryKeys: {
      normalizedLeaseId: id,
      normalizedSearchText: id,
      endDateIso: id === "1" ? "2026-10-10" : "2026-12-10",
      endMonth: "2026-10",
      normalizedOwners: ["alex smith"],
      ownerIdentityKeys: [ownerId],
      normalizedTenants: [],
      tenantIdentityKeys: [],
      workflowStepId: "owner-decision",
      workflowStepIndex: 1,
      waitingOn: "owner",
      dueState: id === "1" ? "due" : "unset",
      dueAtIso: null,
      sourceConflictCount: 0,
      leaseTerm: "fixed_term",
      nextReviewIso: null,
      manualNonRenewal: nonRenewal,
    },
  };
}
it("prioritizes nonrenewals only for an unset view; a deliberate due sort and filters survive reload", () => {
  const rows = [item("1", "101"), item("2", "102", true)];
  const entry = resolveRenewalDeskEntry({
    searchParams: {},
    storedView: null,
    parseExplicit: parseRenewalDeskQueryV2,
    partyTokenResolves: () => false,
  });
  expect(entry.state.sort).toBe("nonrenewals_first");
  expect(
    applyRenewalDeskQueryV2(rows, entry.state, () => false).items.map((r) => r.id),
  ).toEqual(["2", "1"]);
  const saved = "v=2&sort=due&scope=all";
  const remembered = resolveRenewalDeskEntry({
    searchParams: {},
    storedView: saved,
    parseExplicit: parseRenewalDeskQueryV2,
    partyTokenResolves: () => false,
  });
  expect(remembered.source).toBe("saved");
  expect(serializeRenewalDeskQueryV2(remembered.state)).toBe(saved);
  expect(
    applyRenewalDeskQueryV2(rows, remembered.state, () => false).items.map((r) => r.id),
  ).toEqual(["1", "2"]);
});
it("binds related-lease filters to verified person IDs, preserving renamed people and separating identical names", () => {
  const members = [
    { partyKind: "owner" as const, normalizedLabel: "alex smith", sourceId: "101" },
    { partyKind: "owner" as const, normalizedLabel: "alex smith", sourceId: "102" },
    { partyKind: "owner" as const, normalizedLabel: "alex renamed", sourceId: "101" },
  ];
  const resolver = createPartyFilterResolver(config, "renewals", members);
  const first = resolver.tokenFor("owner", "alex smith", "101")!,
    second = resolver.tokenFor("owner", "alex smith", "102")!;
  expect(first).toMatch(/^p2_/);
  expect(first).not.toBe(second);
  expect(resolver.tokenFor("owner", "alex renamed", "101")).toBe(first);
  expect(resolver.tokenFor("owner", "invented", "999")).toBeNull();
  expect(resolver.tokenFor("owner", "alex smith", "")).toBeNull();
  const rows = [item("1", "101"), item("2", "102"), item("3", "101")];
  expect(
    applyRenewalDeskQueryV2(
      rows,
      { ...DEFAULT_RENEWAL_DESK_QUERY_V2, ownerKey: first },
      resolver.matches,
    ).items.map((r) => r.id),
  ).toEqual(["1", "3"]);
  expect(resolver.matches(first, "tenant", ["alex smith"], ["101"])).toBe(false);
  expect(
    createPartyFilterResolver(config, "maintenance", members).matches(
      first,
      "owner",
      ["alex smith"],
      ["101"],
    ),
  ).toBe(false);
});
it("retains unambiguous legacy name filters but refuses ambiguous or unverified membership", () => {
  const legacy = createPartyFilterResolver(config, "renewals");
  const token = legacy.tokenFor("owner", "alex smith")!;
  const member = {
    partyKind: "owner" as const,
    normalizedLabel: "alex smith",
    sourceId: "101",
  };
  const resolver = createPartyFilterResolver(config, "renewals", [member]);
  expect(resolver.matches(token, "owner", ["alex smith"], ["101"])).toBe(true);
  expect(
    createPartyFilterResolver(config, "renewals", [
      member,
      { ...member, sourceId: "102" },
    ]).matches(token, "owner", ["alex smith"], ["101"]),
  ).toBe(false);
  expect(
    createPartyFilterResolver(config, "renewals", [
      member,
      { ...member, sourceId: "" },
    ]).matches(token, "owner", ["alex smith"], ["101"]),
  ).toBe(false);
  const current = resolver.tokenFor("owner", "alex smith", "101")!;
  expect(
    createPartyFilterResolver(config, "renewals", []).matches(
      current,
      "owner",
      ["alex smith"],
      ["101"],
    ),
  ).toBe(false);
});
