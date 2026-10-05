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

// S166 (F15): the desk page chooses its view. An ordinary entry opens the account's remembered
// view; a URL that names a view decides that navigation; opening the page never writes.

interface CapturedDeskProps {
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
    outcome: { status: "ok", view: { items: state.items } },
    auxiliaryFailures: [],
  }),
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
  it("BEH-S166-6: an ordinary entry opens the account's remembered view, in any later session or device", async () => {
    state.stored = SAVED;
    const desk = await open({});
    expect(serializeRenewalDeskQueryV2(desk.query)).toBe(SAVED);
    expect(desk.viewMemory).toEqual({
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
  });

  it("BEH-S166-8 / BEH-S166-9: a link that names a view decides this navigation and the remembered view is untouched", async () => {
    state.stored = SAVED;
    const linked = await open({ v: "2", overallStatus: "blocked" });
    expect(serializeRenewalDeskQueryV2(linked.query)).toBe("v=2&overallStatus=blocked");
    expect(linked.viewMemory).toMatchObject({ source: "explicit", savedView: SAVED });
    // The explicit default link shows the default view.
    const explicitDefault = await open({ v: "2" });
    expect(explicitDefault.query).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 });
    expect(explicitDefault.viewMemory).toMatchObject({
      source: "explicit",
      savedView: SAVED,
    });
    // Returning ordinarily afterwards opens the remembered view again.
    const back = await open({});
    expect(serializeRenewalDeskQueryV2(back.query)).toBe(SAVED);
  });

  it("BEH-S166-10 / AC-S166-3: malformed URLs resolve safely and never change what is remembered", async () => {
    state.stored = SAVED;
    const malformed = await open({ v: "9", sort: "zzz", from: "2026-13-40" });
    expect(malformed.query.sort).toBe("due");
    expect(malformed.query.from).toBe("");
    expect(malformed.viewMemory).toMatchObject({ source: "explicit", savedView: SAVED });
    // A legacy bookmark with no version still names its own view.
    const legacy = await open({ scope: "all" });
    expect(serializeRenewalDeskQueryV2(legacy.query)).toBe("v=2&scope=all");
    expect(legacy.viewMemory.source).toBe("explicit");
    // An unrelated key is an ordinary entry.
    const unrelated = await open({ utm_source: "mail" });
    expect(serializeRenewalDeskQueryV2(unrelated.query)).toBe(SAVED);
  });

  it("BEH-S166-10 / AC-S166-3: a remembered value that no longer validates, or a store that cannot be read, opens the default without an error", async () => {
    state.stored = "v=2&scope=retired_scope";
    const stale = await open({});
    expect(stale.query).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 });
    expect(stale.viewMemory).toMatchObject({ source: "default", savedView: null });

    state.stored = SAVED;
    state.readError = true;
    const unreadable = await open({});
    expect(unreadable.query).toEqual({ ...DEFAULT_RENEWAL_DESK_QUERY_V2 });
    expect(unreadable.viewMemory).toMatchObject({ source: "default", savedView: null });
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
        queryKeys: { normalizedOwners: ["owner sample"], normalizedTenants: [] },
      },
    ];
    state.stored = `v=2&scope=all&ownerKey=${present}`;
    expect(serializeRenewalDeskQueryV2((await open({})).query)).toBe(state.stored);
    // A token minted under a key that has since rotated out no longer resolves: it is dropped.
    state.stored = `v=2&scope=all&ownerKey=${rotated}`;
    const dropped = await open({});
    expect(serializeRenewalDeskQueryV2(dropped.query)).toBe("v=2&scope=all");
    expect(dropped.viewMemory).toMatchObject({
      source: "saved",
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
