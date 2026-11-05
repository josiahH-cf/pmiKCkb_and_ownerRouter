// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
const source = vi.hoisted(() => ({ view: null as unknown }));
// The stored collection and the recorded work cycles the server reads; empty unless a test sets them.
const stored = vi.hoisted(() => ({
  collection: null as unknown,
  workspaces: new Map<string, unknown>(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/lease-renewal/assistant-source", () => ({
  loadRenewalAssistantSource: async () => ({
    outcome: { status: "ok", view: source.view },
    auxiliaryFailures: [],
    cycleDateDecisionsAvailable: true,
  }),
}));
vi.mock("@/lib/firestore/renewal-workspace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firestore/renewal-workspace")>()),
  listRenewalWorkspaces: async () => stored.workspaces,
}));
vi.mock("@/lib/firestore/renewal-shared-collections", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/firestore/renewal-shared-collections")
  >()),
  RenewalSharedCollectionStore: class {
    async get() {
      return stored.collection;
    }
  },
}));

import { RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { RenewalDeskView } from "@/lib/lease-renewal/desk-model";
import { resolveRenewalDeskEntry } from "@/lib/lease-renewal/desk-preferences";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  applyRenewalDeskQueryV2,
  buildActiveFilterChips,
  clearRenewalDeskFilters,
  parseRenewalDeskQueryV2,
  renewalDeskUrlNamesView,
  serializeRenewalDeskQueryV2,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  buildDeskReturnHref,
  buildWorkspaceHref,
  encodeDeskView,
  validateDeskView,
} from "@/lib/lease-renewal/desk-view-continuation";
import { readDeskCollectionView } from "@/lib/lease-renewal/shared-collection-desk";
import { readSharedCollectionSource } from "@/lib/lease-renewal/shared-collection-source";
import {
  sharedCollectionDeskHref,
  sharedCollectionEntryHref,
  type CollectionBasis,
  type CollectionMember,
} from "@/lib/lease-renewal/shared-collections";
import { S246_LEASES, loadS246Desk, s246Manual } from "@/tests/helpers/s246-portfolio";

// S246 R-S246-9: a shared collection link opens the Renewals table narrowed to that collection's
// saved leases. The collection is one optional desk key, appended after every earlier key, so no
// existing desk URL, saved view or continuation changes. Values are synthetic.

const ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const LINK = `/lease-renewal/live/desk?v=2&scope=all&collection=${ID}`;
const MEMBERS: readonly string[] = [
  S246_LEASES.activeInMonth,
  S246_LEASES.closed,
  S246_LEASES.noEndDate,
];
const matchNoParty = () => false;

let view: RenewalDeskView;

beforeAll(async () => {
  view = await loadS246Desk();
  source.view = view;
});

afterEach(cleanup);

function named(search: string): RenewalDeskQueryV2State {
  return parseRenewalDeskQueryV2(new URLSearchParams(search));
}

function withMembers(
  state: RenewalDeskQueryV2State,
  memberIds: readonly string[] = MEMBERS,
): RenewalDeskQueryV2State {
  return { ...state, collectionView: { name: "December follow-up", memberIds } };
}

describe("S246 the shared collection link (R-S246-9, ARCH-S246-3)", () => {
  it("is one desk URL that names the table over every loaded lease and the collection", () => {
    expect(sharedCollectionDeskHref(ID)).toBe(LINK);
    const search = new URLSearchParams(LINK.split("?")[1]);
    expect(renewalDeskUrlNamesView(search)).toBe(true);
    const entry = resolveRenewalDeskEntry({
      searchParams: search,
      storedView: "v=2&overallStatus=blocked",
    });
    // The link decides the navigation: the table, never the working batch or a remembered view.
    expect(entry.surface).toBe("table");
    expect(entry.source).toBe("explicit");
    expect(entry.state.scope).toBe("all");
    expect(entry.state.collection).toBe(ID);
    expect(entry.savedView).toBe("v=2&overallStatus=blocked");
    // A collection named without a version still names a view.
    expect(
      resolveRenewalDeskEntry({ searchParams: { collection: ID }, storedView: null })
        .surface,
    ).toBe("table");
  });

  it("round-trips canonically, appended after every earlier key, and never serializes what was read", () => {
    const state = named(`v=2&scope=all&collection=${ID}`);
    expect(serializeRenewalDeskQueryV2(state)).toBe(`v=2&scope=all&collection=${ID}`);
    expect(
      serializeRenewalDeskQueryV2(
        named(`collection=${ID}&reason=actionable&scope=all&sort=end_date`),
      ),
    ).toBe(`v=2&sort=end_date&scope=all&reason=actionable&collection=${ID}`);
    // The saved leases the server read are render data only.
    expect(serializeRenewalDeskQueryV2(withMembers(state))).toBe(
      `v=2&scope=all&collection=${ID}`,
    );
    expect(serializeRenewalDeskQueryV2(withMembers(state))).not.toContain("101");
    // An id in another letter case is the same collection; anything else names none.
    expect(named(`v=2&collection=${ID.toUpperCase()}`).collection).toBe(ID);
    for (const refused of [
      "",
      "all",
      "../x",
      `${ID}x`,
      "3f2a1b4c5d6e4f708a9b0c1d2e3f4a5b",
    ]) {
      const parsed = named(`v=2&scope=all&collection=${encodeURIComponent(refused)}`);
      expect("collection" in parsed, refused).toBe(false);
      expect(serializeRenewalDeskQueryV2(parsed), refused).toBe("v=2&scope=all");
    }
  });

  it("AC-S246-2: every earlier desk URL keeps its canonical form and carries no collection", () => {
    expect("collection" in DEFAULT_RENEWAL_DESK_QUERY_V2).toBe(false);
    expect("collection" in named("")).toBe(false);
    expect(serializeRenewalDeskQueryV2(named(""))).toBe("");
    for (const earlier of [
      "v=2&scope=all",
      "v=2&sort=end_date&direction=desc&scope=all",
      "v=2&overallStatus=blocked",
      "v=2&month=2026-12",
      "v=2&scope=ended_without_outcome",
      "v=2&scope=all&reason=actionable",
      "v=2&scope=periodic_review&term=month_to_month",
      "v=2&lease=Sample&scope=tracked&conflicts=with&blocked=blocked",
    ]) {
      const parsed = named(earlier);
      expect(serializeRenewalDeskQueryV2(parsed), earlier).toBe(earlier);
      expect("collection" in parsed, earlier).toBe(false);
      expect(validateDeskView(earlier), earlier).toBe(earlier);
    }
  });

  it("lists exactly the collection's saved leases, in table order, over every loaded lease", () => {
    const state = withMembers(named(`v=2&scope=all&collection=${ID}`));
    const result = applyRenewalDeskQueryV2(view.items, state, matchNoParty);
    expect(new Set(result.items.map((row) => row.id))).toEqual(new Set(MEMBERS));
    expect(result.items).toHaveLength(MEMBERS.length);
    expect(result.totalLoaded).toBe(view.items.length);
    // The same rows the unfiltered table holds, in the same relative order.
    const all = applyRenewalDeskQueryV2(view.items, named("v=2&scope=all"), matchNoParty);
    expect(result.items.map((row) => row.id)).toEqual(
      all.items.map((row) => row.id).filter((id) => MEMBERS.includes(id)),
    );
    // It composes with the table's own filters like any other key.
    const narrowed = applyRenewalDeskQueryV2(
      view.items,
      withMembers(named(`v=2&scope=all&endDate=missing&collection=${ID}`)),
      matchNoParty,
    );
    expect(narrowed.items.map((row) => row.id)).toEqual([S246_LEASES.noEndDate]);
    // A saved lease the current read does not hold is simply not listed; nothing is invented.
    const partial = applyRenewalDeskQueryV2(
      view.items,
      withMembers(named(`v=2&scope=all&collection=${ID}`), ["101", "999999"]),
      matchNoParty,
    );
    expect(partial.items.map((row) => row.id)).toEqual(["101"]);
  });

  it("a collection that could not be read lists no lease under it", () => {
    const unread = named(`v=2&scope=all&collection=${ID}`);
    expect(applyRenewalDeskQueryV2(view.items, unread, matchNoParty).items).toEqual([]);
    expect(buildActiveFilterChips(unread).map((chip) => chip.label)).toContain(
      "Shared collection: could not be read",
    );
  });

  it("shows as one removable filter, and a lease opened from it returns to the same collection", () => {
    const state = withMembers(named(`v=2&scope=all&collection=${ID}`));
    const chip = buildActiveFilterChips(state).find(
      (entry) => entry.key === "collection",
    );
    expect(chip?.label).toBe("Shared collection: December follow-up");
    expect(chip && serializeRenewalDeskQueryV2(chip.withoutFilter)).toBe("v=2&scope=all");
    expect(chip && "collection" in chip.withoutFilter).toBe(false);
    expect(chip?.withoutFilter.collectionView).toBeUndefined();
    expect("collection" in clearRenewalDeskFilters(state)).toBe(false);
    const deskView = encodeDeskView(state);
    expect(deskView).toBe(`v=2&scope=all&collection=${ID}`);
    expect(validateDeskView(deskView)).toBe(deskView);
    const lease = buildWorkspaceHref({ leaseId: "101", deskView });
    const carried = new URL(lease, "https://x.invalid").searchParams.get("deskView");
    expect(buildDeskReturnHref(carried)).toBe(LINK);
  });
});

describe("S246 the table under a shared collection (R-S246-9)", () => {
  const rowIds = () =>
    [
      ...document.querySelectorAll(
        'section[aria-label="Renewal worklist"] table.renewal-table tbody > tr[data-lease-id]',
      ),
    ].map((row) => row.getAttribute("data-lease-id"));

  it("renders the collection's leases with its name and count, and offers the collection itself", () => {
    render(
      <RenewalDesk
        query={withMembers(named(`v=2&scope=all&collection=${ID}`))}
        view={view}
      />,
    );
    expect(new Set(rowIds())).toEqual(new Set(MEMBERS));
    const indicator = document.querySelector(`[data-desk-collection="${ID}"]`);
    expect(indicator).toHaveTextContent(
      "Shared collection: December follow-up, 3 saved leases.",
    );
    expect(screen.getByRole("link", { name: "Open the collection" })).toHaveAttribute(
      "href",
      `/lease-renewal/collections?id=${ID}`,
    );
    // Saving what is listed here records those exact leases, never this collection as a filter.
    const save = screen.getByRole("link", {
      name: "Save reviewed leases as a shared collection",
    });
    const target = new URL(save.getAttribute("href")!, "https://x.invalid");
    expect(target.pathname).toBe("/lease-renewal/collections");
    expect(target.searchParams.get("origin")).toBe("explicit");
    expect(target.searchParams.get("criteria")).toBeNull();
    expect(new Set(target.searchParams.get("members")!.split(","))).toEqual(
      new Set(MEMBERS),
    );
    // Every lease link carries the collection, so Back to renewals returns to it.
    for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
      "table.renewal-table a.renewal-lease-link",
    ))
      expect(
        new URL(anchor.getAttribute("href")!, "https://x.invalid").searchParams.get(
          "deskView",
        ),
      ).toBe(`v=2&scope=all&collection=${ID}`);
  });

  it("says so when the collection could not be read, and lists nothing under it", () => {
    render(<RenewalDesk query={named(`v=2&scope=all&collection=${ID}`)} view={view} />);
    expect(rowIds()).toEqual([]);
    expect(document.querySelector(`[data-desk-collection="${ID}"]`)).toHaveTextContent(
      "This collection could not be read, so no leases are listed.",
    );
  });

  it("AC-S246-2: the same table without a collection shows no collection indicator and keeps the worklist save", () => {
    render(<RenewalDesk query={named("v=2&scope=all")} view={view} />);
    expect(rowIds()).toHaveLength(view.items.length);
    expect(document.querySelector("[data-desk-collection]")).toBeNull();
    const save = screen.getByRole("link", {
      name: "Save reviewed leases as a shared collection",
    });
    const target = new URL(save.getAttribute("href")!, "https://x.invalid");
    expect(target.searchParams.get("origin")).toBe("worklist");
    expect(target.searchParams.get("criteria")).toBe("v=2&scope=all");
  });
});

describe("S246 a collection's membership is never another collection's filter", () => {
  const actor: AuthenticatedUser = {
    uid: "uid-sample",
    email: "sample.editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  };
  const basis = (criteria: string): CollectionBasis =>
    ({
      mode: "period",
      origin: "worklist",
      dateField: "lease_end",
      from: "2026-12-01",
      through: "2026-12-31",
      criteria,
      selectedLeaseIds: [],
    }) as unknown as CollectionBasis;

  it("recorded worklist filters still select by their own keys, and a collection key is refused for explicit review", async () => {
    const read = await readSharedCollectionSource(actor);
    const matched = read.matches(basis("v=2&scope=all"));
    expect(matched).toEqual(
      expect.arrayContaining([S246_LEASES.activeInMonth, S246_LEASES.closed]),
    );
    expect(() => read.matches(basis(`v=2&scope=all&collection=${ID}`))).toThrow(
      "The stored selection filters need explicit review.",
    );
    expect(sharedCollectionEntryHref(["101", "101", "106"], "explicit")).toBe(
      "/lease-renewal/collections?members=101%2C106&origin=explicit",
    );
  });
});

describe("S246 the collection link lists a lease only on the cycle it was saved for (S201)", () => {
  const actor: AuthenticatedUser = {
    uid: "uid-sample",
    email: "sample.editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  };
  const rowIds = () =>
    [
      ...document.querySelectorAll(
        'section[aria-label="Renewal worklist"] table.renewal-table tbody > tr[data-lease-id]',
      ),
    ].map((row) => row.getAttribute("data-lease-id"));
  const saved = (members: CollectionMember[]) => ({
    schemaVersion: "shared-renewal-collection/v1",
    id: ID,
    name: "December follow-up",
    members,
    version: 1,
  });
  /** Each lease's current S201 cycle identity, read exactly as the collection page reads it. */
  async function currentMember(leaseId: string): Promise<CollectionMember> {
    const read = await readSharedCollectionSource(actor);
    const record = read.records.find((entry) => entry.member.leaseId === leaseId);
    if (!record) throw new Error(`synthetic lease ${leaseId} has no cycle`);
    return record.member;
  }

  afterEach(() => {
    stored.collection = null;
    stored.workspaces = new Map();
  });

  it("a lease saved for an earlier cycle is not listed on its current cycle's row", async () => {
    stored.collection = saved([
      await currentMember(S246_LEASES.closed),
      {
        leaseId: S246_LEASES.activeInMonth,
        cycleKey: "source:lease_end:2025-12-31",
        cycleDate: "2025-12-31",
      },
      {
        leaseId: "999999",
        cycleKey: "source:lease_end:2026-12-31",
        cycleDate: "2026-12-31",
      },
    ]);
    const collectionView = await readDeskCollectionView(actor, ID, view.items);
    expect(collectionView).toEqual({
      name: "December follow-up",
      memberIds: [S246_LEASES.closed],
      otherCycleCount: 1,
      outsideReadCount: 1,
    });
    const listed = applyRenewalDeskQueryV2(
      view.items,
      { ...named(`v=2&scope=all&collection=${ID}`), collectionView: collectionView! },
      matchNoParty,
    );
    expect(listed.items.map((row) => row.id)).toEqual([S246_LEASES.closed]);
  });

  it("a recorded work cycle is matched by its own identity, as the collection page matches it", async () => {
    stored.workspaces = s246Manual();
    const recordedCycle = await currentMember(S246_LEASES.renewedInSource);
    expect(recordedCycle.cycleKey).toMatch(/^recorded:/);
    stored.collection = saved([
      recordedCycle,
      {
        leaseId: S246_LEASES.completed,
        cycleKey: "source:lease_end:2026-12-31",
        cycleDate: "2026-12-31",
      },
    ]);
    expect(await readDeskCollectionView(actor, ID, view.items)).toEqual({
      name: "December follow-up",
      memberIds: [S246_LEASES.renewedInSource],
      otherCycleCount: 1,
    });
  });

  it("names the saved leases it does not list, beside the ones it does", () => {
    render(
      <RenewalDesk
        query={{
          ...named(`v=2&scope=all&collection=${ID}`),
          collectionView: {
            name: "December follow-up",
            memberIds: [S246_LEASES.closed],
            otherCycleCount: 1,
            outsideReadCount: 2,
          },
        }}
        view={view}
      />,
    );
    expect(rowIds()).toEqual([S246_LEASES.closed]);
    expect(document.querySelector(`[data-desk-collection="${ID}"]`)).toHaveTextContent(
      "Shared collection: December follow-up, 1 saved lease. 1 more saved lease is on a different cycle now. 2 more saved leases are outside this read.",
    );
  });
});
