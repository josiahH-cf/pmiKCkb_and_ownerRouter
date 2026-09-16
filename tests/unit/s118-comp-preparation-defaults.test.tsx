// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OwnerDecisionForm } from "@/components/lease-renewal/RenewalProgressControls";
import type { MarketCompQueryBasis } from "@/lib/lease-renewal/market-comp-query-basis";
import type { MarketSubjectProjection } from "@/lib/lease-renewal/market-subject";
import type { RenewalMarketBasis } from "@/lib/lease-renewal/renewal-progress";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CYCLE = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const ADDRESS = "104 NE Lindsay Ave, Kansas City, MO 64118";
const ENCODED_ADDRESS = "104%20NE%20Lindsay%20Ave%2C%20Kansas%20City%2C%20MO%2064118";

function basis(
  baseRent: MarketCompQueryBasis["baseRent"] = {
    status: "verified",
    value: 1625,
    sourcePath: "lease detail baseRentAmount",
  },
): MarketCompQueryBasis {
  return {
    leaseId: "701",
    addressLabel: ADDRESS,
    policy: {
      maxRadiusMiles: 5,
      requestedCompCount: 15,
      lookupSubjectAttributes: true,
      providerVersion: "rentcast-avm-long-term-v1",
    },
    query: { bedrooms: 3, bathrooms: 2.5, squareFootage: 1400 },
    attributes: [],
    baseRent,
    trendPostalCode: "64118",
  };
}

const RESOLVED: MarketSubjectProjection = { status: "resolved", basis: basis() };

const LIKELY = {
  source: "RentCast",
  confidence: "Likely",
  rangeLow: 1450,
  rangeHigh: 1650,
  pointEstimate: 1550,
  compCount: 3,
  retrievedAt: "2026-09-16T12:00:00.000Z",
  queryBasis: basis(),
};

type Call = { url: string; body: Record<string, unknown> };

function stubFetch(
  handler: (body: Record<string, unknown>) => unknown | Promise<unknown>,
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("comp-screenshot"))
        return { ok: true, json: async () => ({ status: "not_found" }) };
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      calls.push({ url: String(url), body });
      const payload = await handler(body);
      return { ok: true, json: async () => payload };
    }),
  );
  return calls;
}

function mount(
  options: {
    market?: RenewalMarketBasis;
    subject?: MarketSubjectProjection | null;
    onSave?: (action: unknown) => Promise<void>;
  } = {},
) {
  const onSave = options.onSave ?? vi.fn(async () => undefined);
  render(
    <OwnerDecisionForm
      address={ADDRESS}
      current={null}
      currentRent={1625}
      leaseId="701"
      marketSubject={options.subject === undefined ? RESOLVED : options.subject}
      preparation={{
        cycleId: CYCLE,
        market: options.market,
        source: "",
        onSave: onSave as never,
      }}
    />,
  );
  return { onSave };
}

const low = () => screen.getByLabelText(/Market rent: low estimate/) as HTMLInputElement;
const high = () =>
  screen.getByLabelText(/Market rent: high estimate/) as HTMLInputElement;
const pmi = () =>
  screen.getByLabelText(/PMI recommended monthly rent/) as HTMLInputElement;
const radius = () =>
  screen.getByLabelText("Maximum comp search radius (miles)") as HTMLInputElement;
const lookupButton = () =>
  screen.getByRole("button", { name: "Look up market comps (reference only)" });

async function save(onSave: ReturnType<typeof vi.fn>) {
  fireEvent.change(screen.getByLabelText("Source of the comparison and review notes"), {
    target: { value: "Reviewed on 2026-09-16" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save comp preparation" }));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  return onSave.mock.calls[0][0] as Record<string, unknown>;
}

describe("S118 comparison preparation defaults, deliberate lookup and honest basis", () => {
  it("AC-S118-1, AC-S118-2: prefills the labeled starting range, defaults the radius to five miles, links the real reports and spends no lookup on open", () => {
    const calls = stubFetch(() => LIKELY);
    mount();
    expect(low().value).toBe("1340.63");
    expect(high().value).toBe("1909.38");
    expect(pmi().value).toBe("");
    const label = screen.getByText(
      /Starting range from current rent, not market evidence/,
    );
    expect(label.textContent).toContain("$1,340.63 to $1,909.38");
    expect(label.textContent).toContain(
      "17.5% of $1,625 from lease detail baseRentAmount",
    );
    expect(screen.getAllByText(/Starting value from current rent/)).toHaveLength(2);
    expect(radius().value).toBe("5");
    expect(
      screen.getByRole("link", { name: "Open the RentCast property report" }),
    ).toHaveAttribute(
      "href",
      `https://rentcast.io/s/p?address=${ENCODED_ADDRESS}&bedrooms=3&bathrooms=2.5&area=1400&radius=5`,
    );
    expect(
      screen.getByRole("link", { name: "Open the RentCast market report for 64118" }),
    ).toHaveAttribute("href", "https://rentcast.io/s/m?zip=64118");
    expect(
      screen.getByText(/assumes single-family unless you change it there/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/starting range alone does not satisfy that/),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.url.endsWith("market-comps"))).toHaveLength(0);
  });

  it("AC-S118-2: a new lookup carries the five-mile default and an explicit override changes the actual request and the report link", async () => {
    const calls = stubFetch(() => LIKELY);
    mount();
    fireEvent.click(lookupButton());
    await waitFor(() => expect(calls).toHaveLength(1));
    // The default radius is the server policy (five miles); only an override travels explicitly.
    expect(calls[0].body).toEqual({ leaseId: "701", capture: { cycleId: CYCLE } });
    await waitFor(() => expect(lookupButton()).toBeEnabled());

    fireEvent.change(radius(), { target: { value: "3" } });
    expect(
      screen.getByRole("link", { name: "Open the RentCast property report" }),
    ).toHaveAttribute("href", expect.stringMatching(/&radius=3$/));
    expect(
      screen.getByText(
        /This retained lookup used 5 miles; a new lookup uses the radius above \(3 miles\)/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(lookupButton());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].body).toEqual({
      leaseId: "701",
      maxRadiusMiles: 3,
      capture: { cycleId: CYCLE },
    });
    expect(
      screen.getByRole("link", { name: "Open this lookup's RentCast property report" }),
    ).toHaveAttribute("href", expect.stringMatching(/&radius=5$/));
  });

  it("AC-S118-3: a usable result fills only untouched figures, a result landing after an edit keeps the edit, and the save carries the honest basis", async () => {
    let release: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    stubFetch(() => pending);
    const { onSave } = mount();
    fireEvent.click(lookupButton());
    // Edited while the request is in flight: the late result must not overwrite it.
    fireEvent.change(high(), { target: { value: "1950" } });
    release(LIKELY);
    await waitFor(() => expect(low().value).toBe("1450"));
    expect(high().value).toBe("1950");
    expect(pmi().value).toBe("1550");
    expect(screen.getAllByText(/Filled from the RentCast result/)).toHaveLength(2);
    expect(screen.getAllByText(/Edited by you/)).toHaveLength(1);
    expect(screen.queryByText(/Starting value from current rent/)).toBeNull();

    const action = await save(onSave as ReturnType<typeof vi.fn>);
    expect(action).toMatchObject({
      kind: "preparation",
      rangeLow: 1450,
      rangeHigh: 1950,
      pmiNumber: 1550,
      rangeBasis: "reviewed",
      recommendationBasis: "provider",
    });
  });

  it("AC-S118-3: untouched provider values save as the provider basis; an untouched starting range saves as the starting rule with no recommendation", async () => {
    stubFetch(() => LIKELY);
    const first = mount();
    fireEvent.click(lookupButton());
    await waitFor(() => expect(pmi().value).toBe("1550"));
    expect(await save(first.onSave as ReturnType<typeof vi.fn>)).toMatchObject({
      rangeBasis: "provider",
      recommendationBasis: "provider",
    });

    cleanup();
    stubFetch(() => LIKELY);
    const second = mount();
    const action = await save(second.onSave as ReturnType<typeof vi.fn>);
    expect(action).toMatchObject({
      rangeLow: 1340.63,
      rangeHigh: 1909.38,
      rangeBasis: "starting_rule",
    });
    expect(action).not.toHaveProperty("pmiNumber");
    expect(action).not.toHaveProperty("recommendationBasis");

    cleanup();
    stubFetch(() => LIKELY);
    const third = mount({
      market: {
        rangeLow: 1000,
        rangeHigh: 1100,
        pmiNumber: 1050,
        rangeBasis: "reviewed",
        recommendationBasis: "reviewed",
      },
    });
    expect([low().value, high().value, pmi().value]).toEqual(["1000", "1100", "1050"]);
    expect(screen.getAllByText(/Saved with this preparation/)).toHaveLength(3);
    fireEvent.click(lookupButton());
    await waitFor(() => expect(screen.getByText(/from 3 comps/)).toBeInTheDocument());
    expect([low().value, high().value, pmi().value]).toEqual(["1000", "1100", "1050"]);
    expect(await save(third.onSave as ReturnType<typeof vi.fn>)).toMatchObject({
      rangeBasis: "reviewed",
      recommendationBasis: "reviewed",
    });
  });

  it("AC-S118-4: a failed lookup keeps the starting range and the report links and names its cause; a missing base rent or address is identified, never invented", async () => {
    stubFetch(() => ({
      source: "RentCast",
      confidence: "Needs Verification",
      reason: "insufficient_comparables",
      httpStatus: 400,
    }));
    mount();
    fireEvent.click(lookupButton());
    await waitFor(() =>
      expect(screen.getByText(/too few comparable listings match/)).toBeInTheDocument(),
    );
    expect(low().value).toBe("1340.63");
    expect(high().value).toBe("1909.38");
    expect(
      screen.getByRole("link", { name: "Open the RentCast property report" }),
    ).toBeInTheDocument();

    cleanup();
    stubFetch(() => LIKELY);
    mount({
      subject: {
        status: "resolved",
        basis: basis({
          status: "omitted",
          reason:
            "Contractual base rent is unavailable: the RentVine lease detail carries no positive baseRentAmount.",
        }),
      },
    });
    expect(
      screen.getByText(/No starting range: Contractual base rent is unavailable/),
    ).toBeInTheDocument();
    expect(low().value).toBe("");
    expect(high().value).toBe("");
    expect(screen.queryByText(/Starting value from current rent/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open the RentCast property report" }),
    ).toBeInTheDocument();

    cleanup();
    stubFetch(() => LIKELY);
    mount({
      subject: {
        status: "unresolved",
        code: "missing_address",
        message:
          "This lease has no complete RentVine street, city, state, and postal address, so no RentCast lookup ran.",
      },
    });
    expect(
      screen.getByText(/No starting range: This lease has no complete RentVine/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No property report link: This lease has no complete RentVine/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /RentCast/ })).toBeNull();
  });
});
