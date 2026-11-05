import { readFileSync } from "node:fs";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  serializeRenewalDeskQueryV2,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";
import { derivePartyFilterToken } from "@/lib/lease-renewal/party-filter-key";

// S166 (F15): the desk page chooses its view. A URL that names a view decides that navigation;
// opening the page never writes.
// S246 ARCH-S246-3: an ordinary entry (the bare route) opens the working batch. The account's
// remembered view is offered there by its own link and opens exactly as saved from that link.

interface CapturedDeskProps {
  /** S246: present when the navigation opens the working batch. */
  readonly batch?: {
    readonly rows: readonly unknown[];
    readonly savedViewHref: string | null;
  };
  readonly query: RenewalDeskQueryV2State;
  readonly viewMemory: {
    readonly source: string;
    readonly savedView: string | null;
    readonly memory: string;
  };
}

const state = vi.hoisted(() => ({
  user: null as unknown as AuthenticatedUser,
  stored: null as string | null,
  readError: false,
  reads: 0,
  desk: [] as unknown[],
  items: [] as unknown[],
}));
vi.mock("@/lib/firestore/personal-views", () => ({
  getPersonalView: async (actor: AuthenticatedUser) => {
    state.reads++;
    if (state.readError) throw new Error("Read unavailable");
    if (!actor.uid) throw new Error("Actor required");
    return {
      surface: "renewals",
      revision: 0,
      value: {
        query: actor.uid === "uid-pat" ? (state.stored ?? "") : "",
        layout: { columns: {} },
      },
    };
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/auth/page-guards", () => ({
  requirePageSpaceAccess: async () => undefined,
  requirePageCapability: async () => state.user,
}));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/lease-renewal/RenewalDesk", () => ({
  RenewalDesk: (props: unknown) => {
    state.desk.push(props);
    return null;
  },
}));
vi.mock("@/lib/lease-renewal/assistant-source", () => ({
  loadRenewalAssistantSource: async () => ({
    outcome: {
      status: "ok",
      view: {
        items: state.items,
        dataCurrency: { readAtIso: "2026-11-05T15:00:00.000Z", state: "fresh" },
      },
    },
    auxiliaryFailures: [],
    cycleDateDecisionsAvailable: true,
  }),
}));
// The batch row projection has its own tests (s246-working-batch); this file pins which surface
// the page chooses, so its partial fixture rows are counted here and never projected.
vi.mock("@/lib/lease-renewal/renewal-batch-row", () => ({
  projectRenewalBatchRows: (rows: readonly { id: string }[]) =>
    rows.map((row) => ({ leaseId: row.id })),
}));
vi.mock("@/lib/firestore/renewal-desk-preferences", () => ({
  deskPreferenceModeFor: () => "saved",
  getRenewalDeskPreference: async (actor: AuthenticatedUser) => {
    state.reads += 1;
    if (state.readError) throw new Error("store unavailable");
    if (actor.uid !== "uid-pat" || state.stored === null) return null;
    return { view: state.stored, updatedAt: "2026-10-01T15:00:00.000Z" };
  },
  saveRenewalDeskPreference: async () => {
    throw new Error("Opening the worklist must never save a preference.");
  },
}));

import LiveRenewalDeskPage from "@/app/lease-renewal/live/desk/page";

const pat: AuthenticatedUser = {
  uid: "uid-pat",
  email: "pat.sample@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const lee: AuthenticatedUser = {
  ...pat,
  uid: "uid-lee",
  email: "lee.sample@pmikcmetro.com",
};

const SAVED = "v=2&sort=end_date&direction=desc&scope=all";
const SAVED_HREF = `/lease-renewal/live/desk?${SAVED}`;
const KEY = Buffer.alloc(32, 7);

async function open(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<CapturedDeskProps> {
  state.desk = [];
  renderToStaticMarkup(
    await LiveRenewalDeskPage({ searchParams: Promise.resolve(searchParams) }),
  );
  expect(state.desk).toHaveLength(1);
  return state.desk[0] as CapturedDeskProps;
}

beforeEach(() => {
  state.user = pat;
  state.stored = null;
  state.readError = false;
  state.reads = 0;
  state.items = [];
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("S166 the worklist page chooses its view (ARCH-S166-3)", () => {
  it("BEH-S166-6 after S246 ARCH-S246-3: an ordinary entry opens the working batch and offers the account's remembered view, which its own link opens in any later session or device", async () => {
    state.stored = SAVED;
    const desk = await open({});
    expect(desk.batch?.savedViewHref).toBe(SAVED_HREF);
    expect(desk.query).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 });
    expect(desk.viewMemory).toEqual({
      accountId: pat.uid,
      source: "default",
      savedView: SAVED,
      memory: "saved",
    });
    // The link that names the remembered view opens the table exactly as saved.
    const opened = await open(Object.fromEntries(new URLSearchParams(SAVED)));
    expect(opened.batch).toBeUndefined();
    expect(serializeRenewalDeskQueryV2(opened.query)).toBe(SAVED);
    expect(opened.viewMemory).toEqual({
      accountId: pat.uid,
      source: "saved",
      savedView: SAVED,
      memory: "saved",
    });
  });

  it("BEH-S166-11 / AC-S166-2: another account's ordinary entry opens its own default, not this view", async () => {
    state.stored = SAVED;
    state.user = lee;
    const desk = await open({});
    expect(desk.query).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 });
    expect(desk.viewMemory).toMatchObject({ source: "default", savedView: null });
    // S246: its working batch offers no saved view, because this account remembered none.
    expect(desk.batch).toBeDefined();
    expect(desk.batch?.savedViewHref).toBeNull();
  });

  it("BEH-S166-8 / BEH-S166-9: a link that names a view decides this navigation and the remembered view is untouched", async () => {
    state.stored = SAVED;
    const linked = await open({ v: "2", overallStatus: "blocked" });
    expect(linked.batch).toBeUndefined();
    expect(serializeRenewalDeskQueryV2(linked.query)).toBe("v=2&overallStatus=blocked");
    expect(linked.viewMemory).toMatchObject({ source: "explicit", savedView: SAVED });
    // The explicit default link shows the default view.
    const explicitDefault = await open({ v: "2" });
    expect(explicitDefault.batch).toBeUndefined();
    expect(explicitDefault.query).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 });
    expect(explicitDefault.viewMemory).toMatchObject({
      source: "explicit",
      savedView: SAVED,
    });
    // S246: returning ordinarily afterwards opens the working batch, which still offers the
    // remembered view unchanged.
    const back = await open({});
    expect(back.batch?.savedViewHref).toBe(SAVED_HREF);
    expect(back.viewMemory).toMatchObject({ source: "default", savedView: SAVED });
  });

  it("BEH-S166-10 / AC-S166-3: malformed URLs resolve safely and never change what is remembered", async () => {
    state.stored = SAVED;
    const malformed = await open({ v: "9", sort: "zzz", from: "2026-13-40" });
    expect(malformed.query.sort).toBe("nonrenewals_first");
    expect(malformed.query.from).toBe("");
    expect(malformed.viewMemory).toMatchObject({ source: "explicit", savedView: SAVED });
    // A legacy bookmark with no version still names its own view.
    const legacy = await open({ scope: "all" });
    expect(serializeRenewalDeskQueryV2(legacy.query)).toBe("v=2&scope=all");
    expect(legacy.viewMemory.source).toBe("explicit");
    expect(legacy.batch).toBeUndefined();
    // An unrelated key is an ordinary entry: the working batch (S246), with the remembered view
    // still offered.
    const unrelated = await open({ utm_source: "mail" });
    expect(unrelated.batch?.savedViewHref).toBe(SAVED_HREF);
    expect(unrelated.viewMemory).toMatchObject({ source: "default", savedView: SAVED });
  });

  it("BEH-S166-10 / AC-S166-3: a remembered value that no longer validates, or a store that cannot be read, opens the default without an error", async () => {
    state.stored = "v=2&scope=retired_scope";
    const stale = await open({});
    expect(stale.query).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 });
    expect(stale.viewMemory).toMatchObject({ source: "default", savedView: null });
    expect(stale.batch?.savedViewHref).toBeNull();

    state.stored = SAVED;
    state.readError = true;
    const unreadable = await open({});
    expect(unreadable.query).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 });
    expect(unreadable.viewMemory).toMatchObject({ source: "default", savedView: null });
    expect(unreadable.batch?.savedViewHref).toBeNull();
  });

  it("BEH-S166-10: a remembered party filter is kept only while it resolves against a loaded party", async () => {
    vi.stubEnv("RENEWAL_DESK_PARTY_FILTER_KEY", KEY.toString("base64url"));
    const present = derivePartyFilterToken(KEY, {
      spaceId: "renewals",
      partyKind: "owner",
      normalizedLabel: "owner sample",
    });
    const rotated = derivePartyFilterToken(Buffer.alloc(32, 9), {
      spaceId: "renewals",
      partyKind: "owner",
      normalizedLabel: "owner sample",
    });
    state.items = [
      {
        id: "7001",
        identity: {
          owners: [{ label: "owner sample", contactId: { label: "17" } }],
          tenants: [],
        },
        queryKeys: {
          normalizedOwners: ["owner sample"],
          normalizedTenants: [],
          ownerIdentityKeys: ["17"],
          tenantIdentityKeys: [],
        },
      },
    ];
    // S246: the ordinary entry offers the remembered view by its link; the same rule decides
    // what that link carries.
    state.stored = `v=2&scope=all&ownerKey=${present}`;
    const kept = await open({});
    expect(kept.batch?.rows).toHaveLength(1);
    expect(kept.batch?.savedViewHref).toBe(`/lease-renewal/live/desk?${state.stored}`);
    expect(kept.viewMemory.savedView).toBe(state.stored);
    // A token minted under a key that has since rotated out no longer resolves: it is dropped.
    state.stored = `v=2&scope=all&ownerKey=${rotated}`;
    const dropped = await open({});
    expect(dropped.batch?.savedViewHref).toBe("/lease-renewal/live/desk?v=2&scope=all");
    expect(dropped.viewMemory).toMatchObject({
      source: "default",
      savedView: "v=2&scope=all",
    });
  });

  it("BEH-S166-9: opening the worklist only reads; the page has no way to save a preference", async () => {
    state.stored = SAVED;
    await open({});
    await open({ v: "2", scope: "all" });
    expect(state.reads).toBe(2);
    const page = readFileSync("app/lease-renewal/live/desk/page.tsx", "utf8");
    expect(page).not.toContain("saveRenewalDeskPreference");
    expect(page).toContain("resolveRenewalDeskEntry");
  });
});
