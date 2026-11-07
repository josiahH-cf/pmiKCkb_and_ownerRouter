// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { RenewalPricingPolicyAdmin } from "@/components/admin/RenewalPricingPolicyAdmin";
import {
  RenewalPricingPolicyInputSchema,
  type RenewalPricingPolicy,
} from "@/lib/lease-renewal/renewal-pricing-policy";
// Controlled UI transport only. Actual policy transactions/permissions are exercised in
// tests/firestore/s194-renewal-pricing-policies.test.ts; this checks the owning form intent.
let rows: RenewalPricingPolicy[], calls: Record<string, unknown>[], lose: boolean;
const accepted = new Map<string, RenewalPricingPolicy>();
beforeEach(() => {
  rows = [];
  calls = [];
  lose = false;
  accepted.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        "https://example.test",
      );
      expect(url.pathname).toBe("/api/lease-renewal/pricing-policy");
      if (!init?.method || init.method === "GET")
        return Response.json({ policies: rows, cursor: null });
      expect(init.method).toBe("POST");
      const body = JSON.parse(String(init.body));
      calls.push(body);
      expect(body.action).toBe("policy");
      const parsed = RenewalPricingPolicyInputSchema.safeParse(body.policy);
      if (!parsed.success)
        return Response.json(
          { error: "A valid policy name, type and effective date are required." },
          { status: 400 },
        );
      let policy = accepted.get(body.operationId);
      if (!policy) {
        policy = {
          ...parsed.data,
          version: body.expectedVersion + 1,
          updatedAt: "2026-10-10T15:00:00Z",
          updatedByUid: "synthetic-admin",
        };
        accepted.set(body.operationId, policy);
        rows = [...rows.filter((p) => p.id !== policy!.id), policy];
      }
      if (lose) {
        lose = false;
        throw new TypeError("Synthetic lost accepted response");
      }
      return Response.json({ policy });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } });
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: "Save pricing policy" }));
it("administering all four actual policy form types validates input, retains the 3.5% decision, and reopens the saved catalog without consent or provider effects", async () => {
  const view = render(<RenewalPricingPolicyAdmin />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.getByText(/intended MKD percentage is 3.5%/)).toBeInTheDocument();
  expect(screen.getByLabelText("Increase percent")).toHaveValue(3.5);
  for (const label of [
    "Policy name",
    "Increase percent",
    "Effective from",
    "Purpose and change context",
  ])
    expect(screen.getByLabelText(label)).toBeRequired();
  save();
  expect(screen.getByLabelText("Policy name")).toHaveFocus();
  expect(screen.getByText("Enter a policy name.")).toBeVisible();
  expect(screen.getByText("Choose the date the policy takes effect.")).toBeVisible();
  expect(screen.getByText("Enter the purpose and change context.")).toBeVisible();
  expect(calls).toHaveLength(0);
  change("Policy name", "Incomplete policy");
  change("Effective from", "2026-10-10");
  change("Purpose and change context", "Synthetic reviewed reusable policy");
  change("Increase percent", "");
  save();
  expect(screen.getByLabelText("Increase percent")).toHaveFocus();
  expect(screen.getByLabelText("Increase percent")).toHaveValue(null);
  expect(
    screen.getByText("Enter a percent greater than zero and at most 100."),
  ).toBeVisible();
  expect(calls).toHaveLength(0);
  change("Increase percent", "3.5");
  change("Effective through (optional)", "2026-10-09");
  save();
  expect(screen.getByLabelText("Effective through (optional)")).toHaveFocus();
  expect(
    screen.getByText(
      "Choose an end date on or after the effective date, or leave it blank.",
    ),
  ).toBeVisible();
  expect(calls).toHaveLength(0);
  change("Effective through (optional)", "");
  expect(rows).toHaveLength(0);
  for (const [kind, name, value] of [
    ["percentage", "Reviewed percentage", "3.5"],
    ["fixed_dollar", "Reviewed fixed amount", "40.25"],
    ["no_increase", "Reviewed no increase", null],
    ["manual_review", "Reviewed manual review", null],
  ] as const) {
    change("Edit policy", "");
    change("Policy name", name);
    change("Policy type", kind);
    if (value !== null)
      change(kind === "percentage" ? "Increase percent" : "Increase dollars", value);
    else
      expect(
        screen.queryByLabelText(/Increase percent|Increase dollars/),
      ).not.toBeInTheDocument();
    change("Effective from", "2026-10-10");
    change("Purpose and change context", "Synthetic reviewed reusable policy");
    save();
    await within(screen.getByLabelText("Edit policy")).findByRole("option", {
      name: `${name} · v1`,
    });
  }
  expect(rows.map((p) => [p.kind, p.value])).toEqual([
    ["percentage", 3.5],
    ["fixed_dollar", 40.25],
    ["no_increase", null],
    ["manual_review", null],
  ]);
  expect(
    calls.every((c) => c.action === "policy" && !Object.hasOwn(c, "ownerConsent")),
  ).toBe(true);
  view.unmount();
  render(<RenewalPricingPolicyAdmin />);
  await within(screen.getByLabelText("Edit policy")).findByRole("option", {
    name: "Reviewed percentage · v1",
  });
  change("Edit policy", rows[0].id);
  expect(screen.getByLabelText("Increase percent")).toHaveValue(3.5);
});
it("keeps portfolio Save unavailable until the entered portfolio has been read", async () => {
  render(<RenewalPricingPolicyAdmin />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  const field = document.getElementById("pricing-portfolio")!;
  const read = screen.getByRole("button", { name: "Read portfolio assignment" });
  const apply = screen.getByRole("button", { name: "Save portfolio default" });
  expect(field).toBeRequired();
  expect(apply).toBeDisabled();
  fireEvent.click(read);
  expect(field).toHaveFocus();
  expect(
    screen.getByText(
      "Enter a RentVine portfolio ID of 1 to 10 digits, starting with 1 to 9.",
    ),
  ).toBeVisible();
  fireEvent.change(field, { target: { value: "12345678901" } });
  fireEvent.click(read);
  expect(field).toHaveValue("12345678901");
  expect(apply).toBeDisabled();
  expect(
    vi.mocked(fetch).mock.calls.every(([url]) => !String(url).includes("portfolioId=")),
  ).toBe(true);
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  let stale!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation((url, init) =>
    String(url).endsWith("portfolioId=91")
      ? new Promise<Response>((resolve) => (stale = resolve))
      : originalFetch(url, init),
  );
  fireEvent.change(field, { target: { value: "91" } });
  fireEvent.click(read);
  expect(read).toBeDisabled();
  expect(apply).toBeDisabled();
  fireEvent.change(field, { target: { value: "92" } });
  fireEvent.click(read);
  await waitFor(() => expect(apply).toBeEnabled());
  await act(async () => stale(Response.json({ assignment: { version: 4 } })));
  expect(apply).toBeEnabled();
  expect(field).toHaveValue("92");
  fireEvent.change(field, { target: { value: "93" } });
  expect(apply).toBeDisabled();
  expect(calls).toHaveLength(0);
});
it("a lost accepted policy save retries the same ID, operation and exact fields, then a deliberate edit uses its read-back version", async () => {
  render(<RenewalPricingPolicyAdmin />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  change("Policy name", "Recoverable policy");
  change("Effective from", "2026-10-10");
  change("Purpose and change context", "Synthetic reviewed context");
  lose = true;
  save();
  await screen.findByText(/response was not received/i);
  expect(screen.getByLabelText("Policy name")).toHaveValue("Recoverable policy");
  save();
  await within(screen.getByLabelText("Edit policy")).findByRole("option", {
    name: "Recoverable policy · v1",
  });
  expect(calls[1]).toEqual(calls[0]);
  expect(accepted.size).toBe(1);
  expect(rows).toHaveLength(1);
  change("Increase percent", "4");
  save();
  await within(screen.getByLabelText("Edit policy")).findByRole("option", {
    name: "Recoverable policy · v2",
  });
  expect(calls[2].operationId).not.toBe(calls[1].operationId);
  expect(calls[2].expectedVersion).toBe(1);
  expect(rows[0].value).toBe(4);
});
