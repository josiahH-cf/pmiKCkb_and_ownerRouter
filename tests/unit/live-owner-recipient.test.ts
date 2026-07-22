import { describe, expect, it, vi } from "vitest";

import {
  resolveLiveOwnerEmail,
  type LiveOwnerRecipientClient,
} from "@/lib/lease-renewal/live-owner-recipient";

interface Fixtures {
  lease?: Record<string, unknown>;
  property?: Record<string, unknown>;
  portfolio?: Record<string, unknown>;
  contacts?: Record<string, Record<string, unknown>>;
}

// Build a fake read-only client from fixtures. Each hop throws when its fixture is absent so a "missing
// hop" is exercised as a real thrown read (which the resolver must swallow into null), not a soft undefined.
function fakeClient(fixtures: Fixtures) {
  const getLease = vi.fn(async () => {
    if (!fixtures.lease) throw new Error("no lease");
    return fixtures.lease;
  });
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
  const client: LiveOwnerRecipientClient = {
    getLease,
    getProperty,
    getPortfolio,
    getContact,
  };
  return { client, getLease, getProperty, getPortfolio, getContact };
}

const HEALTHY: Fixtures = {
  lease: { leaseID: 42, propertyID: 7 },
  property: { propertyID: 7, portfolioID: 9 },
  portfolio: {
    contacts: [
      { contactID: 3, percentOwned: 60, percentDistributed: 60 },
      { contactID: 4, percentOwned: 40, percentDistributed: 40 },
    ],
  },
  contacts: {
    "3": { contactID: 3, email: "Owner@Cedar-Holdings.com" },
    "4": { contactID: 4, email: "minority@cedar-holdings.com" },
  },
};

describe("resolveLiveOwnerEmail", () => {
  it("resolves the owner email through the full lease -> property -> portfolio -> contact join", async () => {
    const { client, getContact } = fakeClient(HEALTHY);
    const result = await resolveLiveOwnerEmail(client, "42");

    // Picks the max-percentOwned contact (3), and reads/normalizes ITS email.
    expect(getContact).toHaveBeenCalledWith(3);
    expect(result).toEqual({
      email: "owner@cedar-holdings.com",
      sourceRef: "rentvine:lease:42:portfolio:9:contact:3.email",
    });
  });

  it("picks the contact with the greatest percentOwned regardless of array order", async () => {
    const { client, getContact } = fakeClient({
      ...HEALTHY,
      portfolio: {
        contacts: [
          { contactID: 4, percentOwned: 25 },
          { contactID: 3, percentOwned: 75 },
        ],
      },
    });
    const result = await resolveLiveOwnerEmail(client, "42");

    expect(getContact).toHaveBeenCalledWith(3);
    expect(result?.email).toBe("owner@cedar-holdings.com");
  });

  it("ignores non-positive / non-numeric percentOwned when choosing the owner", async () => {
    const { client, getContact } = fakeClient({
      ...HEALTHY,
      portfolio: {
        contacts: [
          { contactID: 9, percentOwned: 0 },
          { contactID: 8, percentOwned: "not-a-number" },
          { contactID: 3, percentOwned: 10 },
        ],
      },
    });
    const result = await resolveLiveOwnerEmail(client, "42");

    expect(getContact).toHaveBeenCalledWith(3);
    expect(result?.email).toBe("owner@cedar-holdings.com");
  });

  it("returns null when the lease carries no propertyID (and never reads property)", async () => {
    const { client, getProperty } = fakeClient({
      ...HEALTHY,
      lease: { leaseID: 42 },
    });
    expect(await resolveLiveOwnerEmail(client, "42")).toBeNull();
    expect(getProperty).not.toHaveBeenCalled();
  });

  it("returns null when the property carries no portfolioID", async () => {
    const { client } = fakeClient({ ...HEALTHY, property: { propertyID: 7 } });
    expect(await resolveLiveOwnerEmail(client, "42")).toBeNull();
  });

  it("returns null when the portfolio contacts list is empty", async () => {
    const { client, getContact } = fakeClient({
      ...HEALTHY,
      portfolio: { contacts: [] },
    });
    expect(await resolveLiveOwnerEmail(client, "42")).toBeNull();
    expect(getContact).not.toHaveBeenCalled();
  });

  it("returns null when contacts is missing entirely", async () => {
    const { client } = fakeClient({ ...HEALTHY, portfolio: {} });
    expect(await resolveLiveOwnerEmail(client, "42")).toBeNull();
  });

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
    expect(await resolveLiveOwnerEmail(client, "42")).toBeNull();
    expect(getContact).not.toHaveBeenCalled();
  });

  it("still resolves when lower-ranked contacts tie but one strictly leads", async () => {
    const { client, getContact } = fakeClient({
      ...HEALTHY,
      portfolio: {
        contacts: [
          { contactID: 5, percentOwned: 20 },
          { contactID: 6, percentOwned: 20 },
          { contactID: 3, percentOwned: 60 },
        ],
      },
    });
    const result = await resolveLiveOwnerEmail(client, "42");
    expect(getContact).toHaveBeenCalledWith(3);
    expect(result?.email).toBe("owner@cedar-holdings.com");
  });

  it("returns null when the owner contact has no email", async () => {
    const { client } = fakeClient({
      ...HEALTHY,
      contacts: { "3": { contactID: 3 } },
    });
    expect(await resolveLiveOwnerEmail(client, "42")).toBeNull();
  });

  it("returns null when the owner contact email is invalid", async () => {
    const { client } = fakeClient({
      ...HEALTHY,
      contacts: { "3": { contactID: 3, email: "not-an-email" } },
    });
    expect(await resolveLiveOwnerEmail(client, "42")).toBeNull();
  });

  it("never throws when a hop read fails (returns null instead)", async () => {
    const { client } = fakeClient({ lease: { leaseID: 42, propertyID: 7 } }); // property read throws
    await expect(resolveLiveOwnerEmail(client, "42")).resolves.toBeNull();
  });

  it("produces an authoritative source ref (never a sample/test/synthetic prefix)", async () => {
    const { client } = fakeClient(HEALTHY);
    const result = await resolveLiveOwnerEmail(client, "42");
    expect(result?.sourceRef.startsWith("rentvine:")).toBe(true);
    for (const bad of [
      "sample:",
      "test:",
      "fixture:",
      "smoke:",
      "dry:",
      "synthetic:",
      "browser:",
    ]) {
      expect(result?.sourceRef.startsWith(bad)).toBe(false);
    }
  });
});
