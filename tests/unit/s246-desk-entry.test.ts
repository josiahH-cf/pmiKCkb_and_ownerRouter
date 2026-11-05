import { describe, expect, it } from "vitest";

import { resolveRenewalDeskEntry } from "@/lib/lease-renewal/desk-preferences";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  applyRenewalDeskQueryV2,
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  RENEWAL_DESK_ALL_LEASES_HREF,
  buildDeskReturnHref,
  buildWorkspaceHref,
  renewalBatchHref,
  renewalDeskSavedViewHref,
  validateDeskContinuation,
  validateDeskView,
} from "@/lib/lease-renewal/desk-view-continuation";
import { S246_LEASES, loadS246Desk } from "@/tests/helpers/s246-portfolio";

// S246 ARCH-S246-3 / AC-S246-2: only the bare desk route changes. Every URL that names a table
// view keeps resolving to the same table state through the same parser. Values are synthetic.

const REMEMBERED = "v=2&scope=all&term=month_to_month";
const entry = (search: string, storedView: string | null = REMEMBERED) =>
  resolveRenewalDeskEntry({ searchParams: new URLSearchParams(search), storedView });

describe("S246 entry resolution (ARCH-S246-3)", () => {
  it("ARCH-S246-3: the bare route opens the working batch and offers the remembered view instead of applying it", () => {
    const resolved = entry("");
    expect(resolved.surface).toBe("batch");
    expect(resolved.source).toBe("default");
    expect(serializeRenewalDeskQueryV2(resolved.state)).toBe("");
    // R-S246-9: the saved view is still known, so the desk can offer "Open my saved view".
    expect(resolved.savedView).toBe(REMEMBERED);
    expect(resolved.batch).toEqual({ month: null, group: null });
  });

  it("the batch's own keys choose its month and open group without naming a table view", () => {
    const resolved = entry("batch=2027-01&group=not_targets");
    expect(resolved.surface).toBe("batch");
    expect(resolved.batch).toEqual({ month: "2027-01", group: "not_targets" });
    expect(entry("batch=2026-13&group=other").batch).toEqual({
      month: null,
      group: null,
    });
    // A key the desk does not know leaves the ordinary entry on the batch.
    expect(entry("utm_source=mail").surface).toBe("batch");
  });

  it("explicit table links, v=2 links and saved-view links stay on the table", () => {
    for (const search of [
      "v=2",
      "v=2&scope=all",
      "v=2&month=2026-12",
      "month=2026-12",
      "scope=tracked",
      "owner=Example%20Owner",
      REMEMBERED,
      // A table key wins over the batch keys on the same URL.
      "batch=2026-12&v=2&scope=all",
    ]) {
      const resolved = entry(search);
      expect(resolved.surface, search).toBe("table");
      expect(resolved.state, search).toEqual(
        parseRenewalDeskQueryV2(new URLSearchParams(search)),
      );
    }
    expect(entry("v=2").source).toBe("explicit");
    expect(entry("v=2&scope=all").source).toBe("explicit");
    // The saved-view link names the remembered view, so the table says whose view it is.
    expect(entry(REMEMBERED).source).toBe("saved");
    expect(entry(REMEMBERED, null).source).toBe("explicit");
  });

  it("AC-S246-2: every existing desk URL key alone still resolves to the table with the unchanged parser", () => {
    const sample: Record<string, string> = {
      q: "sample",
      lease: "101",
      sort: "end_date",
      direction: "desc",
      scope: "all",
      endDate: "2026-12-31",
      month: "2026-12",
      due: "due",
      ownerKey: `p1_${"a".repeat(43)}`,
      tenantKey: `p1_${"b".repeat(43)}`,
      from: "2026-12-01",
      through: "2026-12-31",
      step: "owner-decision",
      waiting: "owner",
      conflicts: "with",
      overallStatus: "blocked",
      blocked: "blocked",
      rentVerification: "verified",
      term: "month_to_month",
      workStatus: "not_recorded",
      moveOut: "initiated",
      moveOutTiming: "cannot_determine",
      lifecycle: "upcoming",
      reason: "actionable",
    };
    // Every key of the version 2 contract is covered, so a new key cannot slip past this check.
    expect(Object.keys(sample).sort()).toEqual(
      Object.keys(DEFAULT_RENEWAL_DESK_QUERY_V2).sort(),
    );
    for (const [key, value] of Object.entries(sample)) {
      const params = new URLSearchParams({ [key]: value });
      if (key === "from") params.set("through", sample.through);
      if (key === "through") params.set("from", sample.from);
      const resolved = resolveRenewalDeskEntry({
        searchParams: params,
        storedView: null,
      });
      expect(resolved.surface, key).toBe("table");
      expect(resolved.state, key).toEqual(parseRenewalDeskQueryV2(params));
    }
  });

  it("AC-S246-2: the full table still lists every loaded lease, closed leases included", async () => {
    const view = await loadS246Desk();
    const all = entry("v=2&scope=all");
    const rows = applyRenewalDeskQueryV2(view.items, all.state, () => false);
    expect(rows.items).toHaveLength(view.items.length);
    expect(rows.items.map((row) => row.id)).toContain(S246_LEASES.closed);
    // The explicit default table view is the same default scope as before this suite.
    const defaults = applyRenewalDeskQueryV2(view.items, entry("v=2").state, () => false);
    expect(defaults.items.map((row) => row.id)).toContain(S246_LEASES.closed);
  });
});

describe("S246 links between the batch and the table (R-S246-9)", () => {
  it("All leases and filters and Open my saved view always name their table view", () => {
    expect(RENEWAL_DESK_ALL_LEASES_HREF).toBe("/lease-renewal/live/desk?v=2&scope=all");
    expect(entry(RENEWAL_DESK_ALL_LEASES_HREF.split("?")[1]).surface).toBe("table");
    expect(renewalDeskSavedViewHref(REMEMBERED)).toBe(
      `/lease-renewal/live/desk?${REMEMBERED}`,
    );
    expect(renewalDeskSavedViewHref(null)).toBeNull();
    expect(renewalDeskSavedViewHref("")).toBeNull();
    expect(renewalBatchHref({ month: null, group: null })).toBe(
      "/lease-renewal/live/desk",
    );
    expect(renewalBatchHref({ month: "2027-01", group: "completed" })).toBe(
      "/lease-renewal/live/desk?batch=2027-01&group=completed",
    );
  });
});

describe("S246 return to the batch a lease was opened from (R-S246-8)", () => {
  it("a lease link carries the batch month and group, and Back to renewals rebuilds exactly that batch", () => {
    const href = buildWorkspaceHref({
      leaseId: "101",
      step: "owner-decision",
      deskView: "batch=2027-01&group=not_targets",
    });
    expect(href).toBe(
      "/lease-renewal/live/desk/lease/101?step=owner-decision&deskView=batch%3D2027-01%26group%3Dnot_targets",
    );
    const carried = new URL(href, "https://app.example.invalid").searchParams.get(
      "deskView",
    );
    expect(buildDeskReturnHref(carried)).toBe(
      "/lease-renewal/live/desk?batch=2027-01&group=not_targets",
    );
    expect(validateDeskContinuation(carried)).toBe("batch=2027-01&group=not_targets");
  });

  it("table continuations keep returning to their exact table view", () => {
    for (const view of ["v=2", "v=2&scope=all", "v=2&month=2026-12&term=fixed_term"]) {
      expect(validateDeskContinuation(view)).toBe(view);
      expect(buildDeskReturnHref(view)).toBe(`/lease-renewal/live/desk?${view}`);
    }
    // A stored account view stays strictly a table view: a batch address is never remembered.
    expect(validateDeskView("batch=2027-01")).toBeNull();
  });

  it("anything else falls back to the ordinary entry and can never leave the desk route", () => {
    for (const value of [
      null,
      undefined,
      "",
      "batch=2027-01&v=2",
      "batch=2027-1",
      "group=unknown",
      "batch=2027-01&deskView=v%3D2",
      "https://elsewhere.example/",
      "//elsewhere.example",
    ]) {
      expect(validateDeskContinuation(value), String(value)).toBeNull();
      expect(buildDeskReturnHref(value), String(value)).toBe("/lease-renewal/live/desk");
    }
  });
});
