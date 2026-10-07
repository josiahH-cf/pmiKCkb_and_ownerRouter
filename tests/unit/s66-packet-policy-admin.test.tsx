/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RenewalPacketPolicyAdminPanel } from "@/components/admin/RenewalPacketPolicyAdminPanel";
import { resolveFamilyUse } from "@/lib/lease-documents/family-use";

const NOW = "2026-10-07T00:00:00.000Z";
let posts: Array<{ url: string; body: Record<string, unknown> }>;
let reply: (
  url: string,
  body: Record<string, unknown>,
) => { status: number; body: unknown };

beforeEach(() => {
  posts = [];
  reply = () => ({ status: 200, body: {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      posts.push({ url, body });
      const answer = reply(url, body);
      return new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function initial() {
  return {
    familyUse: { readable: true, version: 0, families: resolveFamilyUse(null, NOW) },
    chargePolicy: { readable: true, record: null },
  };
}

describe("S66 Admin renewal packet configuration (AC-S66-6, AC-S66-7)", () => {
  it("lists every family with its labeled engineering default and records one use against the loaded version", async () => {
    reply = (_url, body) => ({
      status: 200,
      body: {
        familyUse: {
          readable: true,
          version: 1,
          families: resolveFamilyUse(
            {
              schemaVersion: "lease-artifact-family-use/v1",
              version: 1,
              families: {
                kcrar_additional_disclosures: {
                  use: body.use as "mandatory",
                  recordedAt: NOW,
                  recordedByUid: "admin-1",
                },
              },
              updatedAt: NOW,
              updatedByUid: "admin-1",
            },
            NOW,
          ),
        },
      },
    });
    render(<RenewalPacketPolicyAdminPanel initial={initial()} />);
    const rows = document.querySelectorAll("[data-family-use-kind]");
    expect(rows).toHaveLength(10);
    const kcrar = document.querySelector(
      '[data-family-use-kind="kcrar_additional_disclosures"]',
    ) as HTMLElement;
    expect(
      within(kcrar).getByText(/Engineering default until an Admin records a use/),
    ).toBeTruthy();
    fireEvent.change(within(kcrar).getByRole("combobox"), {
      target: { value: "mandatory" },
    });
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      url: "/api/admin/lease-artifact-family-use",
      body: {
        kind: "kcrar_additional_disclosures",
        use: "mandatory",
        expectedVersion: 0,
      },
    });
    expect(await screen.findByText(/is now required/)).toBeTruthy();
    expect(within(kcrar).getByText(/Recorded in configuration version 1/)).toBeTruthy();
  });

  it("publishes entered amounts in cents as a new version and shows a refusal without changing the page", async () => {
    reply = (url) =>
      url.endsWith("lease-charge-policy")
        ? {
            status: 400,
            body: { error: "There is a gap between Under 25 lb and Over." },
          }
        : { status: 200, body: {} };
    render(<RenewalPacketPolicyAdminPanel initial={initial()} />);
    fireEvent.change(screen.getByLabelText(/Resident Benefit Package, monthly/), {
      target: { value: "45" },
    });
    fireEvent.click(screen.getByLabelText("Animal charges use published tiers"));
    fireEvent.change(screen.getByLabelText("Tier name"), {
      target: { value: "Under 25 lb" },
    });
    fireEvent.change(screen.getByLabelText("Up to (exclusive, empty for no limit)"), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByLabelText("Monthly amount"), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByLabelText("One-time fee"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Refundable deposit"), {
      target: { value: "150.50" },
    });
    fireEvent.change(screen.getByLabelText("Effective from"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish a new policy version" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toMatchObject({
      effectiveFrom: "2026-10-01",
      expectedVersion: 0,
      content: {
        residentBenefitPackage: { monthlyCents: 4_500 },
        insuranceProgram: null,
        animals: {
          basis: "weight_lb",
          tiers: [
            {
              label: "Under 25 lb",
              min: 0,
              maxExclusive: 25,
              monthlyCents: 2_500,
              oneTimeCents: 20_000,
              refundableDepositCents: 15_050,
            },
          ],
        },
      },
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(/gap between/);
    expect(screen.getByText(/No charge policy is published/)).toBeTruthy();
  });
});
