import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/admin/offer-charge-mappings/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  readOfferChargeMappings,
  saveOfferChargeMappings,
} from "@/lib/firestore/renewal-offer-charge-mappings";
import {
  describeOfferChargeMapping,
  diffOfferChargeMappings,
  mappingForAccount,
  OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
  OfferChargeMappingEntrySchema,
  offerMappingVersion,
  SaveOfferChargeMappingsSchema,
  type OfferChargeMappingEntry,
} from "@/lib/lease-renewal/offer-charge-mapping";

// S264 AC-S264-1 (mapping owner): the approved offer charge mapping model and its Admin route.
// The schema keeps meaning only (account, verified label, family, cadence, applicability and
// approval evidence; never an amount), Water / sewer stays with a verified utility, and the route
// is Admin only. The store's persistence, compare-and-save and readback run against the emulator
// in tests/firestore/s264-offer-charges.test.ts.
vi.mock("@/lib/firestore/renewal-offer-charge-mappings", () => ({
  readOfferChargeMappings: vi.fn(),
  saveOfferChargeMappings: vi.fn(),
}));

const PET: OfferChargeMappingEntry = {
  entryId: "00000000-0000-4000-8000-000000009001",
  accountId: "9001",
  accountName: "Synthetic Pet Rent",
  displayLabel: "Pet rent",
  family: "pet",
  frequencyMonths: 1,
  applicability: "active_on_renewal_date",
  requirement: null,
  approval: { reference: "Synthetic approval note", approvedOn: "2026-11-01" },
};
const admin = {
  uid: "synthetic-admin",
  email: "synthetic-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};
const editor = { ...admin, uid: "synthetic-editor", role: "Editor" as const };
const issue = (value: unknown) => {
  const parsed = OfferChargeMappingEntrySchema.safeParse(value);
  return parsed.success ? null : parsed.error.issues[0]?.message;
};

describe("S264 AC-S264-1 the mapping supplies meaning only", () => {
  it("accepts an approved synthetic mapping and keeps amounts, dates and contacts out of its label", () => {
    expect(issue(PET)).toBeNull();
    expect(issue({ ...PET, displayLabel: "Pet rent $45" })).toBe(
      "Keep amounts, dates and contacts out of the display label.",
    );
    expect(issue({ ...PET, accountId: "PET-1" })).toBe(
      "Enter the RentVine account ID (digits).",
    );
    expect(issue({ ...PET, amount: 45 })).not.toBeNull();
    expect(issue({ ...PET, frequencyMonths: 0 })).not.toBeNull();
    expect(
      issue({ ...PET, approval: { reference: "ok", approvedOn: "2026-11-01" } }),
    ).not.toBeNull();
    expect(
      issue({
        ...PET,
        approval: { reference: "Synthetic note", approvedOn: "2026-02-30" },
      }),
    ).toBe("Choose a real calendar date.");
  });

  it("Water / sewer belongs to a verified utility only; a separate requirement says what it is", () => {
    expect(issue({ ...PET, displayLabel: "Water / sewer" })).toBe(
      "Water / sewer is the label for a verified water or sewer utility only.",
    );
    expect(
      issue({ ...PET, family: "utilities", displayLabel: "Water / sewer" }),
    ).toBeNull();
    expect(issue({ ...PET, family: "separate_requirement" })).toBe(
      "Say what the separate requirement is.",
    );
    expect(issue({ ...PET, requirement: "Synthetic requirement" })).toBe(
      "Only a separate requirement records a requirement.",
    );
  });

  it("one mapping per account and per identity; an unreadable store maps nothing", () => {
    const save = (entries: OfferChargeMappingEntry[]) =>
      SaveOfferChargeMappingsSchema.safeParse({
        entries,
        expectedVersion: 0,
        operationId: "00000000-0000-4000-8000-000000000001",
      });
    expect(save([PET]).success).toBe(true);
    const twice = save([
      PET,
      { ...PET, entryId: "00000000-0000-4000-8000-000000009002" },
    ]);
    expect(twice.success).toBe(false);
    expect(twice.error?.issues[0]?.message).toBe(
      "RentVine account 9001 is mapped twice. Keep one mapping per account.",
    );
    const record = {
      schemaVersion: OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
      version: 4,
      entries: [PET],
      updatedAt: "2026-11-02T15:00:00.000Z",
      updatedByUid: "synthetic-admin",
    };
    expect(mappingForAccount({ readable: true, record }, "9001")).toEqual(PET);
    expect(mappingForAccount({ readable: true, record }, "9002")).toBeNull();
    expect(offerMappingVersion({ readable: true, record })).toBe(4);
    expect(offerMappingVersion({ readable: true, record: null })).toBe(0);
    expect(offerMappingVersion({ readable: false, record: null })).toBeNull();
  });

  it("the review names what one save adds, changes and removes, in staff words", () => {
    const credit = {
      ...PET,
      entryId: "00000000-0000-4000-8000-000000009003",
      accountId: "9003",
      displayLabel: "Credit reporting",
      family: "credit_reporting" as const,
    };
    const diff = diffOfferChargeMappings([PET], [{ ...PET, frequencyMonths: 3 }, credit]);
    expect(diff.added).toEqual([credit]);
    expect(diff.changed.map((change) => change.after.frequencyMonths)).toEqual([3]);
    expect(diff.removed).toEqual([]);
    expect(diffOfferChargeMappings([PET], []).removed).toEqual([PET]);
    expect(describeOfferChargeMapping(PET)).toBe(
      'RentVine account 9001 (Synthetic Pet Rent) shows as "Pet rent": Pet rent, monthly, carries forward when active on the renewal date. Approved: Synthetic approval note, 2026-11-01.',
    );
  });
});

describe("S264 AC-S264-1 the Admin route", () => {
  const post = (body: unknown) =>
    POST(
      new Request("http://localhost/api/admin/offer-charge-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  beforeEach(() => {
    vi.mocked(readOfferChargeMappings).mockReset();
    vi.mocked(saveOfferChargeMappings).mockReset();
  });
  afterEach(() => setAuthResolverForTest(() => null));

  it("an Editor is refused before any read or save", async () => {
    setAuthResolverForTest(() => editor);
    expect((await GET()).status).toBe(403);
    expect((await post({ entries: [] })).status).toBe(403);
    expect(readOfferChargeMappings).not.toHaveBeenCalled();
    expect(saveOfferChargeMappings).not.toHaveBeenCalled();
  });

  it("an Admin reads, saves with the reviewed version and receives the store's readback; a stale save is refused", async () => {
    setAuthResolverForTest(() => admin);
    vi.mocked(readOfferChargeMappings).mockResolvedValue({
      readable: true,
      record: null,
    });
    const read = await GET();
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toContain("no-store");
    expect(await read.json()).toEqual({ mappings: { readable: true, record: null } });
    const record = {
      schemaVersion: OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
      version: 1,
      entries: [PET],
      updatedAt: "2026-11-02T15:00:00.000Z",
      updatedByUid: admin.uid,
    };
    vi.mocked(saveOfferChargeMappings).mockResolvedValue({ record, duplicate: false });
    const body = {
      entries: [PET],
      expectedVersion: 0,
      operationId: "00000000-0000-4000-8000-000000000002",
    };
    const saved = await post(body);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      mappings: { readable: true, record },
      duplicate: false,
    });
    expect(vi.mocked(saveOfferChargeMappings).mock.calls[0]?.slice(0, 2)).toEqual([
      admin,
      body,
    ]);
    vi.mocked(saveOfferChargeMappings).mockRejectedValue(
      new EditableLayerError(
        "The offer charge mappings changed since you reviewed them. Reload, review the current version and save again.",
        409,
      ),
    );
    const stale = await post(body);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error:
        "The offer charge mappings changed since you reviewed them. Reload, review the current version and save again.",
    });
  });
});
