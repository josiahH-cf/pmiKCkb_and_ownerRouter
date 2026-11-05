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
import {
  PublishChargePolicyInputSchema,
  type ChargePolicyRecord,
} from "@/lib/lease-documents/charge-policy";
import { resolveFamilyUse } from "@/lib/lease-documents/family-use";
import { FORM_QUESTION_IDS } from "@/lib/lease-documents/form-open-questions";

// S253 R-S253-2, R-S253-7, R-S253-11 on the Admin configuration: the pet processing fee is
// published with a source note and no default, the starting text is the team's own and ships
// empty, and the open questions are listed copy-ready. Synthetic amounts and text only.

const NOW = "2026-11-05T15:00:00.000Z";
const SOURCE = "SYNTHETIC source note for the processing fee";
let requests: Array<{
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}>;
let reply: (
  method: string,
  url: string,
  body: Record<string, unknown> | null,
) => { status: number; body: unknown };

beforeEach(() => {
  requests = [];
  reply = () => ({ status: 200, body: {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ method, url, body });
      const answer = reply(method, url, body);
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

function initial(record: ChargePolicyRecord | null = null) {
  return {
    familyUse: { readable: true, version: 0, families: resolveFamilyUse(null, NOW) },
    chargePolicy: { readable: true, record },
  };
}

function published(version = 1): ChargePolicyRecord {
  return {
    schemaVersion: "renewal-charge-policy/v1",
    version,
    effectiveFrom: "2026-11-01",
    content: {
      residentBenefitPackage: null,
      insuranceProgram: null,
      animals: null,
      petProcessingFee: { amountCents: 5_000, unit: null, source: SOURCE },
    },
    publishedAt: NOW,
    publishedByUid: "admin-1",
  };
}

const policy = () => document.querySelector("[data-charge-policy]") as HTMLElement;
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const posts = () => requests.filter((request) => request.method === "POST");

describe("S253 R-S253-2: an Admin publishes the pet processing fee", () => {
  it("offers no amount: the fee and its source start empty, and nothing is requested on load", () => {
    render(<RenewalPacketPolicyAdminPanel initial={initial()} />);
    expect(input("policy-pet-fee").value).toBe("");
    expect(input("policy-pet-fee-source").value).toBe("");
    expect(input("policy-pet-fee").getAttribute("placeholder")).toBeNull();
    expect(policy().textContent).not.toMatch(/\$\s?\d|\b50\b|\b150\b/);
    expect(requests).toEqual([]);
  });

  it("publishes a policy that carries the fee alone, with its source note and no unit", async () => {
    reply = () => ({
      status: 200,
      body: { chargePolicy: { readable: true, record: published() } },
    });
    render(<RenewalPacketPolicyAdminPanel initial={initial()} />);
    fireEvent.change(input("policy-pet-fee"), { target: { value: "50" } });
    fireEvent.change(input("policy-pet-fee-source"), { target: { value: SOURCE } });
    fireEvent.change(input("policy-effective"), { target: { value: "2026-11-01" } });
    fireEvent.click(
      within(policy()).getByRole("button", { name: "Publish a new policy version" }),
    );
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].url).toBe("/api/admin/lease-charge-policy");
    expect(posts()[0].body).toMatchObject({
      content: {
        residentBenefitPackage: null,
        insuranceProgram: null,
        animals: null,
        petProcessingFee: { amountCents: 5_000, unit: null, source: SOURCE },
      },
      effectiveFrom: "2026-11-01",
      expectedVersion: 0,
    });
    // What the page sends is what the publication schema accepts.
    expect(PublishChargePolicyInputSchema.safeParse(posts()[0].body).success).toBe(true);
    expect(await screen.findByText("Published charge policy version 1.")).toBeTruthy();
  });

  it("needs where the amount comes from, and an amount above zero", async () => {
    render(<RenewalPacketPolicyAdminPanel initial={initial()} />);
    fireEvent.change(input("policy-effective"), { target: { value: "2026-11-01" } });
    const publish = within(policy()).getByRole("button", {
      name: "Publish a new policy version",
    });
    fireEvent.change(input("policy-pet-fee"), { target: { value: "50" } });
    fireEvent.click(publish);
    expect((await within(policy()).findByRole("alert")).textContent).toBe(
      "Pet processing fee: say where the amount comes from.",
    );
    fireEvent.change(input("policy-pet-fee-source"), { target: { value: SOURCE } });
    fireEvent.change(input("policy-pet-fee"), { target: { value: "0" } });
    fireEvent.click(publish);
    expect((await within(policy()).findByRole("alert")).textContent).toBe(
      "Pet processing fee: enter an amount above zero.",
    );
    expect(posts()).toEqual([]);
  });

  it("leaves what one fee covers unset while the business has not confirmed it", () => {
    render(<RenewalPacketPolicyAdminPanel initial={initial()} />);
    expect(document.querySelector('[data-pet-fee-unit="unset"]')?.textContent).toMatch(
      /^What one fee covers is still an open question for the business, so it stays unset\./,
    );
    expect(document.getElementById("policy-pet-fee-unit")).toBeNull();
  });

  it("starts from the published version and publishes a policy without a fee when the field is emptied", async () => {
    reply = () => ({
      status: 200,
      body: { chargePolicy: { readable: true, record: published(2) } },
    });
    render(<RenewalPacketPolicyAdminPanel initial={initial(published())} />);
    expect(input("policy-pet-fee").value).toBe("50.00");
    expect(input("policy-pet-fee-source").value).toBe(SOURCE);
    fireEvent.change(input("policy-pet-fee"), { target: { value: "" } });
    fireEvent.click(
      within(policy()).getByRole("button", { name: "Publish a new policy version" }),
    );
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body?.content).toEqual({
      residentBenefitPackage: null,
      insuranceProgram: null,
      animals: null,
    });
  });

  it("still publishes tier amounts exactly as before", async () => {
    render(<RenewalPacketPolicyAdminPanel initial={initial()} />);
    fireEvent.click(screen.getByLabelText("Animal charges use published tiers"));
    for (const [id, value] of [
      ["policy-tier-0-label", "Every weight"],
      ["policy-tier-0-monthly", "25"],
      ["policy-tier-0-oneTime", "0"],
      ["policy-tier-0-deposit", "225"],
      ["policy-effective", "2026-11-01"],
    ])
      fireEvent.change(input(id), { target: { value } });
    fireEvent.click(
      within(policy()).getByRole("button", { name: "Publish a new policy version" }),
    );
    await waitFor(() => expect(posts()).toHaveLength(1));
    const content = posts()[0].body!.content as Record<string, unknown>;
    expect(content).not.toHaveProperty("petProcessingFee");
    expect(content.animals).toMatchObject({
      basis: "weight_lb",
      tiers: [
        { label: "Every weight", monthlyCents: 2_500, refundableDepositCents: 22_500 },
      ],
      treatments: { pet: "tiered", assistance_animal: "no_charge" },
    });
  });
});

describe("S253 R-S253-7: the team's starting text is an Admin setting that ships empty", () => {
  const section = () =>
    document.querySelector("[data-owner-explanation-starting-text]") as HTMLElement;
  const url = "/api/admin/owner-explanation-starting-text";

  it("reads the setting only when an Admin opens it, and shows it empty", async () => {
    reply = () => ({
      status: 200,
      body: { startingText: { readable: true, revision: 0, text: "", updatedAt: null } },
    });
    render(<RenewalPacketPolicyAdminPanel initial={initial()} />);
    expect(requests).toEqual([]);
    fireEvent.click(
      within(section()).getByRole("button", { name: "Open the starting text" }),
    );
    const box = (await within(section()).findByLabelText(
      "Starting text",
    )) as HTMLTextAreaElement;
    expect(box.value).toBe("");
    expect(requests).toEqual([{ method: "GET", url, body: null }]);
  });

  it("saves the text an Admin typed against the revision it read", async () => {
    reply = (method, _url, body) =>
      method === "GET"
        ? {
            status: 200,
            body: { startingText: { readable: true, revision: 0, text: "" } },
          }
        : {
            status: 200,
            body: {
              startingText: { readable: true, revision: 1, text: body!.text },
              duplicate: false,
            },
          };
    render(<RenewalPacketPolicyAdminPanel initial={initial()} />);
    fireEvent.click(
      within(section()).getByRole("button", { name: "Open the starting text" }),
    );
    const box = await within(section()).findByLabelText("Starting text");
    fireEvent.change(box, {
      target: { value: "SYNTHETIC starting text.\n\nSYNTHETIC second paragraph." },
    });
    fireEvent.click(
      within(section()).getByRole("button", { name: "Save the starting text" }),
    );
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]).toMatchObject({
      url,
      body: {
        text: "SYNTHETIC starting text.\n\nSYNTHETIC second paragraph.",
        expectedRevision: 0,
      },
    });
    expect(String(posts()[0].body!.operationId)).toMatch(/^[0-9a-f-]{36}$/);
    expect(await within(section()).findByText("Starting text saved.")).toBeTruthy();
  });

  it("shows a refusal and keeps what was typed", async () => {
    reply = (method) =>
      method === "GET"
        ? {
            status: 200,
            body: {
              startingText: { readable: true, revision: 3, text: "SYNTHETIC kept." },
            },
          }
        : {
            status: 409,
            body: {
              error:
                "The starting text changed since the page was loaded. Reload before saving.",
            },
          };
    render(<RenewalPacketPolicyAdminPanel initial={initial()} />);
    fireEvent.click(
      within(section()).getByRole("button", { name: "Open the starting text" }),
    );
    const box = (await within(section()).findByLabelText(
      "Starting text",
    )) as HTMLTextAreaElement;
    expect(box.value).toBe("SYNTHETIC kept.");
    fireEvent.change(box, { target: { value: "SYNTHETIC edited." } });
    fireEvent.click(
      within(section()).getByRole("button", { name: "Save the starting text" }),
    );
    expect((await within(section()).findByRole("alert")).textContent).toBe(
      "The starting text changed since the page was loaded. Reload before saving.",
    );
    expect(box.value).toBe("SYNTHETIC edited.");
  });
});

describe("S253 R-S253-11: the open questions are listed copy-ready", () => {
  it("lists every open question with who is asked, what it holds and what works meanwhile", () => {
    render(<RenewalPacketPolicyAdminPanel initial={initial()} />);
    const list = document.querySelector("[data-open-form-questions]") as HTMLElement;
    expect(list.querySelector("summary")?.textContent).toBe("Open form questions (8)");
    expect(
      [...list.querySelectorAll("[data-open-form-question]")].map((item) =>
        item.getAttribute("data-open-form-question"),
      ),
    ).toEqual([...FORM_QUESTION_IDS]);
    const first = list.querySelector('[data-open-form-question="deposit_schedule"]');
    expect(first?.textContent).toContain(
      "Asked of Dan. Holds only: A deposit filled in without staff. Works meanwhile: A deposit staff record with its source.",
    );
    // The list is shown, never sent: nothing here requests anything.
    expect(requests).toEqual([]);
  });
});
