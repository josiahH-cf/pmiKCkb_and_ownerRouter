// S61: this module is the MAINTENANCE owner join only. The renewal owner channel resolves from the
// export view's own portfolio.owners[] (owner email measured present on 305/305 rows, so the former
// lease-keyed resolveLiveOwnerEmail entry is deleted). The percentOwned ordering rule lives HERE
// because this path's portfolio contacts[] genuinely carry the field (AC-S61-4), and an equal-top
// tie refuses rather than guesses (AC-S61-5).

import { describe, expect, it, vi } from "vitest";

import {
  resolveOwnerContactFromPropertyId,
  type PropertyOwnerClient,
} from "@/lib/lease-renewal/live-owner-recipient";

interface Fixtures {
  property?: Record<string, unknown>;
  portfolio?: Record<string, unknown>;
  contacts?: Record<string, Record<string, unknown>>;
}

// Build a fake read-only client from fixtures. Each hop throws when its fixture is absent so a
// "missing hop" is exercised as a real thrown read (swallowed into null), not a soft undefined.
function fakeClient(fixtures: Fixtures) {
  const getProperty = vi.fn(async () => {
    if (!fixtures.property) throw new Error("no property");
    return fixtures.property;
  });
  const getPortfolio = vi.fn(async () => {
    if (!fixtures.portfolio) throw new Error("no portfolio");
    return fixtures.portfolio;
  });
  const getContact = vi.fn(async (id: string | number) => {
    const contact = fixtures.contacts?.[String(id)];
    if (!contact) throw new Error("no contact");
    return contact;
  });
  const client: PropertyOwnerClient = { getProperty, getPortfolio, getContact };
  return { client, getProperty, getPortfolio, getContact };
}

const HEALTHY: Fixtures = {
  property: { propertyID: 7, portfolioID: 9 },
  portfolio: {
    contacts: [
      { contactID: 3, percentOwned: 60, percentDistributed: 60 },
      { contactID: 4, percentOwned: 40, percentDistributed: 40 },
    ],
  },
  contacts: {
    "3": { contactID: 3, email: "Owner@Cedar-Holdings.com", name: "Cedar Holdings" },
    "4": { contactID: 4, email: "minority@cedar-holdings.com" },
  },
};

describe("resolveOwnerContactFromPropertyId (maintenance owner join)", () => {
  it("resolves the owner through property -> portfolio -> contact with a normalized email", async () => {
    const { client } = fakeClient(HEALTHY);
    const owner = await resolveOwnerContactFromPropertyId(client, 7);
    expect(owner).toMatchObject({
      email: "owner@cedar-holdings.com",
      portfolioId: 9,
      contactId: 3,
      name: "Cedar Holdings",
    });
  });

  // AC-S61-4 (the path that actually carries percentOwned): the greatest positive share wins,
  // regardless of array order, deterministically.
  it("picks the contact with the greatest percentOwned regardless of array order", async () => {
    const { client } = fakeClient({
      ...HEALTHY,
      portfolio: {
        contacts: [
          { contactID: 4, percentOwned: 40 },
          { contactID: 3, percentOwned: 60 },
        ],
      },
    });
    const first = await resolveOwnerContactFromPropertyId(client, 7);
    const second = await resolveOwnerContactFromPropertyId(client, 7);
    expect(first?.contactId).toBe(3);
    expect(second).toEqual(first);
  });

  it("ignores non-positive and non-numeric percentOwned when choosing the owner", async () => {
    const { client } = fakeClient({
      ...HEALTHY,
      portfolio: {
        contacts: [
          { contactID: 5, percentOwned: 0 },
          { contactID: 6, percentOwned: "lots" },
          { contactID: 3, percentOwned: 60 },
        ],
      },
    });
    expect((await resolveOwnerContactFromPropertyId(client, 7))?.contactId).toBe(3);
  });

  // AC-S61-5: an equal-top tie refuses with nobody addressed — never an arbitrary pick.
  it("returns null (ambiguous, never guesses) when the top percentOwned is a tie", async () => {
    const { client, getContact } = fakeClient({
      ...HEALTHY,
      portfolio: {
        contacts: [
          { contactID: 3, percentOwned: 50 },
          { contactID: 4, percentOwned: 50 },
        ],
      },
    });
    expect(await resolveOwnerContactFromPropertyId(client, 7)).toBeNull();
    expect(getContact).not.toHaveBeenCalled();
  });

  it("still resolves when lower-ranked contacts tie but one strictly leads", async () => {
    const { client } = fakeClient({
      ...HEALTHY,
      portfolio: {
        contacts: [
          { contactID: 3, percentOwned: 50 },
          { contactID: 4, percentOwned: 25 },
          { contactID: 5, percentOwned: 25 },
        ],
      },
    });
    expect((await resolveOwnerContactFromPropertyId(client, 7))?.contactId).toBe(3);
  });

  it("returns null when the property carries no portfolioID", async () => {
    const { client } = fakeClient({ ...HEALTHY, property: { propertyID: 7 } });
    expect(await resolveOwnerContactFromPropertyId(client, 7)).toBeNull();
  });

  it("returns null when the portfolio contacts list is empty or missing", async () => {
    const empty = fakeClient({ ...HEALTHY, portfolio: { contacts: [] } });
    expect(await resolveOwnerContactFromPropertyId(empty.client, 7)).toBeNull();
    const missing = fakeClient({ ...HEALTHY, portfolio: {} });
    expect(await resolveOwnerContactFromPropertyId(missing.client, 7)).toBeNull();
  });

  it("returns null when the winning contact has no valid email (never invents one)", async () => {
    const { client } = fakeClient({
      ...HEALTHY,
      contacts: { "3": { contactID: 3, email: "not-an-email" } },
    });
    expect(await resolveOwnerContactFromPropertyId(client, 7)).toBeNull();
  });

  it("swallows a thrown hop into null so the caller blocks honestly", async () => {
    const { client } = fakeClient({ ...HEALTHY, portfolio: undefined });
    expect(await resolveOwnerContactFromPropertyId(client, 7)).toBeNull();
  });
});
