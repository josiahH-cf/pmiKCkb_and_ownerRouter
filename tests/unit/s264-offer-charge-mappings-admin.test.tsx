// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OfferChargeMappingsEditor } from "@/components/admin/OfferChargeMappingsEditor";
import { OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION } from "@/lib/lease-renewal/offer-charge-mapping";

// S264 AC-S264-1 (Admin → Renewal packet policy → Offer charge mappings): the Admin opens the
// section, records an approved synthetic account mapping, reviews exactly what the save adds,
// saves against the reviewed version and reads back the stored version. A save after another
// Admin's save is refused with the stale message, and the reviewed drafts stay on screen.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stub(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ method: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe("/api/admin/offer-charge-mappings");
      calls.push({
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      const next = responses.shift()!;
      return new Response(JSON.stringify(next.body), {
        status: next.status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return calls;
}

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("S264 AC-S264-1 Offer charge mappings", () => {
  it("reviews, saves against the reviewed version and reads back; a stale save is refused", async () => {
    const saved = (entries: unknown, version: number) => ({
      status: 200,
      body: {
        mappings: {
          readable: true,
          record: {
            schemaVersion: OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
            version,
            entries,
            updatedAt: "2026-11-10T15:00:00.000Z",
            updatedByUid: "synthetic-admin",
          },
        },
        duplicate: false,
      },
    });
    const responses: Array<{ status: number; body: unknown }> = [
      { status: 200, body: { mappings: { readable: true, record: null } } },
    ];
    const calls = stub(responses);
    render(<OfferChargeMappingsEditor />);
    expect(screen.getByRole("heading", { name: "Offer charge mappings" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open offer charge mappings" }));
    await screen.findByText(
      "No offer charge mappings are saved. Every RentVine charge line waits for staff review.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Add a mapping" }));
    fill("RentVine account ID", "9001");
    fill("RentVine account name", "Synthetic Pet Rent");
    fill("Verified display label", "Pet rent");
    fill("Offer family", "pet");
    fill("Supported cadence", "1");
    fill("Applicability scope", "active_on_renewal_date");
    fill("Approval evidence", "Synthetic approval note");
    fill("Approved on", "2026-11-01");
    fireEvent.click(screen.getByRole("button", { name: "Review the mapping changes" }));
    const review = await screen.findByRole("region", { name: "Mapping changes to save" });
    expect(within(review).getByText(/^Added:/).textContent).toBe(
      'Added: RentVine account 9001 (Synthetic Pet Rent) shows as "Pet rent": Pet rent, monthly, carries forward when active on the renewal date. Approved: Synthetic approval note, 2026-11-01.',
    );
    // The store's readback is what the section shows afterwards.
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push({ method: "POST", body });
      const reply = saved(body.entries, 1);
      return new Response(JSON.stringify(reply.body), { status: 200 });
    });
    fireEvent.click(screen.getByRole("button", { name: "Save offer charge mappings" }));
    await screen.findByText("Saved version 1. Read back: 1 mapping.");
    const post = calls.find((call) => call.method === "POST")!.body as {
      entries: Array<Record<string, unknown>>;
      expectedVersion: number;
      operationId: string;
    };
    expect(post.expectedVersion).toBe(0);
    expect(post.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(post.entries).toEqual([
      expect.objectContaining({
        accountId: "9001",
        accountName: "Synthetic Pet Rent",
        displayLabel: "Pet rent",
        family: "pet",
        frequencyMonths: 1,
        applicability: "active_on_renewal_date",
        requirement: null,
        approval: { reference: "Synthetic approval note", approvedOn: "2026-11-01" },
      }),
    ]);
    expect(screen.getByText(/^Current version 1, saved 2026-11-10\.$/)).toBeTruthy();

    // Another Admin saved in between: the next save is refused and nothing is replaced.
    fill("Verified display label", "Pet rent monthly");
    fireEvent.click(screen.getByRole("button", { name: "Review the mapping changes" }));
    await screen.findByRole("region", { name: "Mapping changes to save" });
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
      calls.push({ method: "POST", body: JSON.parse(String(init?.body)) });
      return new Response(
        JSON.stringify({
          error:
            "The offer charge mappings changed since you reviewed them. Reload, review the current version and save again.",
        }),
        { status: 409 },
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Save offer charge mappings" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          "The offer charge mappings changed since you reviewed them. Reload, review the current version and save again.",
        ),
      ).toBeTruthy(),
    );
    expect((calls.at(-1)!.body as { expectedVersion: number }).expectedVersion).toBe(1);
    expect(
      (screen.getByLabelText("Verified display label") as HTMLInputElement).value,
    ).toBe("Pet rent monthly");
  });

  it("an entry that is not complete names its mapping and field before any save", async () => {
    const calls = stub([
      { status: 200, body: { mappings: { readable: true, record: null } } },
    ]);
    render(<OfferChargeMappingsEditor />);
    fireEvent.click(screen.getByRole("button", { name: "Open offer charge mappings" }));
    await screen.findByRole("button", { name: "Add a mapping" });
    fireEvent.click(screen.getByRole("button", { name: "Add a mapping" }));
    fill("RentVine account ID", "Pet");
    fireEvent.click(screen.getByRole("button", { name: "Review the mapping changes" }));
    expect(
      (await screen.findByText(/^Mapping 1, RentVine account ID:/)).textContent,
    ).toBe("Mapping 1, RentVine account ID: Enter the RentVine account ID (digits).");
    expect(screen.queryByRole("region", { name: "Mapping changes to save" })).toBeNull();
    expect(calls.filter((call) => call.method === "POST")).toEqual([]);
  });
});
