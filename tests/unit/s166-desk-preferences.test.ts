import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  canonicalDeskPreferenceView,
  resolveRenewalDeskEntry,
  revalidateStoredDeskView,
} from "@/lib/lease-renewal/desk-preferences";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  parseRenewalDeskQueryV2,
  renewalDeskUrlNamesView,
  serializeRenewalDeskQueryV2,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  DESK_VIEW_MAX_CODE_UNITS,
  EXPLICIT_DEFAULT_DESK_VIEW,
  RENEWAL_DESK_ROUTE,
  buildDeskHref,
  buildDeskReturnHref,
  buildExplicitDeskHref,
  buildWorkspaceHref,
  encodeDeskView,
  parseDeskViewState,
  validateDeskView,
} from "@/lib/lease-renewal/desk-view-continuation";

// S166 (F15): the account's remembered worklist view and how one navigation chooses its view.
// Pure contract; the store, route, page and controls have their own tests.

const TOKEN = `p1_${"a".repeat(43)}`;
const SAVED = "v=2&sort=end_date&direction=desc&scope=all";

describe("S166 which URLs name a view (ARCH-S166-3)", () => {
  it("BEH-S166-6 / BEH-S166-8: only a URL with no desk key is an ordinary entry", () => {
    expect(renewalDeskUrlNamesView({})).toBe(false);
    expect(renewalDeskUrlNamesView(new URLSearchParams(""))).toBe(false);
    // An unrelated key is not a view.
    expect(renewalDeskUrlNamesView({ utm_source: "mail" })).toBe(false);
    // The explicit default link, every canonical key and a legacy bookmark all name a view.
    expect(renewalDeskUrlNamesView({ v: "2" })).toBe(true);
    expect(renewalDeskUrlNamesView(new URLSearchParams("v=2&scope=all"))).toBe(true);
    expect(renewalDeskUrlNamesView({ sort: "end_date" })).toBe(true);
    expect(renewalDeskUrlNamesView({ owner: "Sample Owner" })).toBe(true);
    expect(renewalDeskUrlNamesView({ tenant: "Sample Tenant" })).toBe(true);
    expect(renewalDeskUrlNamesView({ lifecycle: "complete" })).toBe(true);
  });

  it("BEH-S166-7 / BEH-S166-8: a control can always name the default view explicitly", () => {
    expect(buildExplicitDeskHref({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 })).toBe(
      `${RENEWAL_DESK_ROUTE}?v=2`,
    );
    expect(
      buildExplicitDeskHref({ ...DEFAULT_RENEWAL_DESK_QUERY_V2, scope: "all" }),
    ).toBe(`${RENEWAL_DESK_ROUTE}?v=2&scope=all`);
    // The ordinary entry stays the bare route.
    expect(buildDeskHref({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 })).toBe(RENEWAL_DESK_ROUTE);
  });

  it("BEH-S166-8 / BEH-S166-10: the explicit default view survives a workspace round trip; the canonical contract is otherwise unchanged", () => {
    expect(EXPLICIT_DEFAULT_DESK_VIEW).toBe("v=2");
    expect(validateDeskView(EXPLICIT_DEFAULT_DESK_VIEW)).toBe("v=2");
    expect(buildDeskReturnHref("v=2")).toBe(`${RENEWAL_DESK_ROUTE}?v=2`);
    expect(parseDeskViewState("v=2")).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 });
    expect(buildWorkspaceHref({ leaseId: "7001", deskView: "v=2" })).toBe(
      "/lease-renewal/live/desk/lease/7001?deskView=v%3D2",
    );
    // Existing behavior: defaults omit the continuation; damaged values fall back to the bare desk.
    expect(encodeDeskView({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 })).toBeNull();
    expect(buildDeskReturnHref(null)).toBe(RENEWAL_DESK_ROUTE);
    for (const damaged of [
      "v=3",
      "v=2&v=2",
      "?v=2",
      "v=2#x",
      "v=2&extra=1",
      "sort=end_date",
      "//evil.example/?v=2",
    ]) {
      expect(validateDeskView(damaged)).toBeNull();
      expect(buildDeskReturnHref(damaged)).toBe(RENEWAL_DESK_ROUTE);
    }
  });
});

describe("S166 what may be remembered (ARCH-S166-2)", () => {
  it("BEH-S166-5: a deliberate change is stored as the canonical view", () => {
    expect(
      canonicalDeskPreferenceView("v=2&direction=desc&sort=end_date&scope=all"),
    ).toBe(SAVED);
    expect(canonicalDeskPreferenceView(`v=2&ownerKey=${TOKEN}`)).toBe(
      `v=2&ownerKey=${TOKEN}`,
    );
  });

  it("BEH-S166-7: choosing the default view is stored as the default", () => {
    expect(canonicalDeskPreferenceView("v=2")).toBe("");
    // S177: deliberate search text is now retained in the private account view.
    const withText = canonicalDeskPreferenceView(
      "v=2&q=Jane+Doe&lease=123+Main+St&direction=desc&sort=end_date&scope=all",
    );
    expect(withText).toBe(
      "v=2&q=Jane+Doe&lease=123+Main+St&sort=end_date&direction=desc&scope=all",
    );
    expect(canonicalDeskPreferenceView("v=2&q=Jane+Doe")).toBe("v=2&q=Jane+Doe");
    // S196: Due is now a deliberate sort; preserve it rather than silently choosing the new default.
    expect(canonicalDeskPreferenceView("v=2&scope=active&sort=due")).toBe("v=2&sort=due");
  });

  it("BEH-S166-10: only a version 2 desk query within the size limit is accepted, and unknown values fall back per key", () => {
    expect(canonicalDeskPreferenceView("")).toBeNull();
    expect(canonicalDeskPreferenceView("scope=all")).toBeNull();
    expect(canonicalDeskPreferenceView("v=3&scope=all")).toBeNull();
    expect(canonicalDeskPreferenceView("?v=2&scope=all")).toBeNull();
    expect(canonicalDeskPreferenceView("v=2&scope=all#x")).toBeNull();
    expect(
      canonicalDeskPreferenceView(`v=2&lease=${"x".repeat(DESK_VIEW_MAX_CODE_UNITS)}`),
    ).toBeNull();
    expect(canonicalDeskPreferenceView(42)).toBeNull();
    // Unknown keys and invalid values are dropped; a display party label is never stored.
    expect(
      canonicalDeskPreferenceView("v=2&scope=all&sort=zzz&owner=Sample+Owner&extra=1"),
    ).toBe("v=2&scope=all");
    expect(canonicalDeskPreferenceView("v=2&ownerKey=not-a-token&scope=all")).toBe(
      "v=2&scope=all",
    );
  });

  it("BEH-S166-10: a stored value that no longer validates becomes no preference, without an error", () => {
    expect(revalidateStoredDeskView(SAVED)).toBe(SAVED);
    expect(revalidateStoredDeskView("")).toBe("");
    for (const stale of [
      "v=2&scope=retired_scope",
      "v=2&direction=desc&sort=end_date",
      "v=1&scope=all",
      "scope=all",
      null,
      undefined,
      17,
      { view: SAVED },
    ]) {
      expect(revalidateStoredDeskView(stale)).toBeNull();
    }
  });
});

describe("S166 one navigation chooses its view (ARCH-S166-3)", () => {
  it("BEH-S166-6: an ordinary entry opens the remembered view", () => {
    const entry = resolveRenewalDeskEntry({ searchParams: {}, storedView: SAVED });
    expect(entry.source).toBe("saved");
    expect(serializeRenewalDeskQueryV2(entry.state)).toBe(SAVED);
    expect(entry.savedView).toBe(SAVED);
  });

  it("BEH-S166-6 / BEH-S166-7: with nothing remembered, or the default remembered, an ordinary entry opens the default", () => {
    for (const storedView of [null, undefined, ""]) {
      const entry = resolveRenewalDeskEntry({ searchParams: {}, storedView });
      expect(entry.source).toBe("default");
      expect(entry.state).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 });
      expect(entry.savedView).toBeNull();
    }
  });

  it("BEH-S166-8 / BEH-S166-9: an explicit link decides this navigation and leaves the remembered view as it was", () => {
    const entry = resolveRenewalDeskEntry({
      searchParams: new URLSearchParams("v=2&overallStatus=blocked"),
      storedView: SAVED,
    });
    expect(entry.source).toBe("explicit");
    expect(serializeRenewalDeskQueryV2(entry.state)).toBe("v=2&overallStatus=blocked");
    expect(entry.savedView).toBe(SAVED);

    // The explicit default link shows the default view, not the remembered one.
    const explicitDefault = resolveRenewalDeskEntry({
      searchParams: { v: "2" },
      storedView: SAVED,
    });
    expect(explicitDefault.source).toBe("explicit");
    expect(explicitDefault.state).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 });
    expect(explicitDefault.savedView).toBe(SAVED);
  });

  it("BEH-S166-10 / AC-S166-3: a malformed explicit URL resolves as it always did and never changes what is remembered", () => {
    const malformed = resolveRenewalDeskEntry({
      searchParams: new URLSearchParams("v=9&sort=zzz&from=2026-13-40&scope=all"),
      storedView: SAVED,
    });
    expect(malformed.source).toBe("explicit");
    expect(serializeRenewalDeskQueryV2(malformed.state)).toBe("v=2&scope=all");
    expect(malformed.savedView).toBe(SAVED);
    // The page's own parser (legacy label resolution) is used for an explicit URL.
    const legacy = resolveRenewalDeskEntry({
      searchParams: { owner: "Sample Owner" },
      storedView: SAVED,
      parseExplicit: (params) =>
        parseRenewalDeskQueryV2(params, { resolveLegacyPartyLabel: () => TOKEN }),
    });
    expect(legacy.source).toBe("explicit");
    expect(legacy.state.ownerKey).toBe(TOKEN);
  });

  it("BEH-S166-10 / AC-S166-3: a remembered value that no longer validates opens the default without an error", () => {
    for (const storedView of [
      "v=2&scope=retired_scope",
      "v=7",
      "not a query",
      "sort=due",
    ]) {
      const entry = resolveRenewalDeskEntry({ searchParams: {}, storedView });
      expect(entry.source).toBe("default");
      expect(entry.state).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 });
      expect(entry.savedView).toBeNull();
    }
  });

  it("BEH-S166-10: a remembered party filter that no longer resolves is dropped and the rest of the view is kept", () => {
    const storedView = `v=2&scope=all&ownerKey=${TOKEN}`;
    const kept = resolveRenewalDeskEntry({
      searchParams: {},
      storedView,
      partyTokenResolves: () => true,
    });
    expect(serializeRenewalDeskQueryV2(kept.state)).toBe(storedView);

    const dropped = resolveRenewalDeskEntry({
      searchParams: {},
      storedView,
      partyTokenResolves: (kind, token) => !(kind === "owner" && token === TOKEN),
    });
    expect(dropped.source).toBe("saved");
    expect(serializeRenewalDeskQueryV2(dropped.state)).toBe("v=2&scope=all");
    expect(dropped.savedView).toBe("v=2&scope=all");

    // When the party filter was the whole view, what is left is the default.
    const onlyParty = resolveRenewalDeskEntry({
      searchParams: {},
      storedView: `v=2&tenantKey=${TOKEN}`,
      partyTokenResolves: () => false,
    });
    expect(onlyParty.source).toBe("default");
    expect(onlyParty.savedView).toBeNull();
  });
});

describe("S166 preferences never decide whether a lease can be worked (ARCH-S166-3)", () => {
  it("BEH-S166-12 / AC-S166-3: the lease workspace and its save routes do not read the remembered view", () => {
    for (const path of [
      "app/lease-renewal/live/desk/lease/[leaseId]/page.tsx",
      "app/api/lease-renewal/workspace/route.ts",
      "app/api/lease-renewal/working-record/route.ts",
      "app/api/lease-renewal/work-status/route.ts",
      "lib/firestore/renewal-workspace.ts",
      "lib/lease-renewal/live-desk.ts",
    ]) {
      const body = readFileSync(path, "utf8");
      expect(body, path).not.toMatch(/desk-preferences/);
    }
    // A lease hidden by the remembered filters still has its ordinary workspace link.
    const entry = resolveRenewalDeskEntry({
      searchParams: {},
      storedView: "v=2&overallStatus=blocked",
    });
    expect(entry.source).toBe("saved");
    expect(buildWorkspaceHref({ leaseId: "7002", deskView: null })).toBe(
      "/lease-renewal/live/desk/lease/7002",
    );
  });
});
