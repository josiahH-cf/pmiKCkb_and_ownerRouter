// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import { readRowsFromPage } from "../../scripts/run-production-reconciliation";

// Real DOM selectors with asynchronous browser-style reads expose overlapping counter updates.
function locator(elements: readonly Element[]): ReturnType<Page["locator"]> {
  const single = () => {
    if (elements.length !== 1) throw new Error("strict_locator");
    return elements[0];
  };
  return {
    locator: (selector: string) =>
      locator(elements.flatMap((element) => [...element.querySelectorAll(selector)])),
    count: async () => elements.length,
    first: () => locator(elements.slice(0, 1)),
    nth: (index: number) => locator(elements.slice(index, index + 1)),
    getAttribute: async (name: string) => single().getAttribute(name),
    textContent: async () => single().textContent,
    allTextContents: async () => elements.map((element) => element.textContent ?? ""),
  } as unknown as ReturnType<Page["locator"]>;
}

function fixture(count: number, badLabels: boolean) {
  document.body.innerHTML = `<section aria-label="Renewal worklist"><table class="renewal-table"><tbody>${Array.from(
    { length: count },
    (_, i) => `
    <tr data-lease-id="${i + 1}" data-workspace-available="false" data-status="needs_verification" data-rent-verification="needs_verification" data-rent-verification-differs="false" data-action-kind="none" data-blocker-count="1" data-manual-complete="none" data-manual-next="none" data-manual-pending-source-updates="none">
      <th><span>Lease ${i + 1}</span><span class="renewal-td-secondary">Lease ID</span></th>
      <td><span>Owner ${i + 1}</span></td><td><span>Tenant ${i + 1}</span></td>
      <td><span>2027-01-31</span></td><td><span>$1,000</span></td>
      <td data-status="needs_verification"><a class="renewal-status-link" href="/lease-renewal/live/desk?v=2&amp;overallStatus=needs_verification&amp;scope=all"><span class="renewal-status-badge"><span>${badLabels ? "Wrong overall" : "Needs verification"}</span></span></a></td>
      <td data-rent-verification="needs_verification" data-rent-verification-differs="false"><span class="renewal-status-badge"><span>${badLabels ? "Wrong rent" : "Needs verification"}</span></span></td>
      <td data-action-kind="none" data-blocker-count="1"><ul class="renewal-blocker-list"><li data-blocker-id="missing-source" data-blocker-type="${badLabels ? "invalid" : "source"}" data-required-capability="none">Source</li></ul></td>
    </tr>`,
  ).join("")}</tbody></table></section>`;
  const page = {
    evaluate: async (read: (input: unknown) => unknown, input: unknown) => read(input),
    locator: (selector: string) => locator([...document.querySelectorAll(selector)]),
  } as unknown as Page;
  return {
    page,
    expected: Array.from({ length: count }, (_, i) => ({
      leaseId: String(i + 1),
      workspaceExpected: false,
      rentvineSourceUrl: null,
    })) as unknown as Parameters<typeof readRowsFromPage>[2],
  };
}

describe("batched complete-cohort DOM evidence", () => {
  it("retains every row and every independent identity/value with no clean-row mismatches", async () => {
    const { page, expected } = fixture(41, false);
    const result = await readRowsFromPage(
      page,
      "https://candidate.example",
      expected,
      null,
      new AbortController().signal,
    );
    expect(result.rows.map((row) => row.leaseId)).toEqual(
      expected.map((row) => row.leaseId),
    );
    expect(result.rows.map((row) => row.address)).toEqual(
      expected.map((row) => `Lease ${row.leaseId}`),
    );
    expect(result.rows[40]).toMatchObject({
      owners: ["Owner 41"],
      tenants: ["Tenant 41"],
      endDate: "2027-01-31",
      baseRent: "$1,000",
      manual: { complete: "none", nextActivity: "none", pendingSourceUpdates: "none" },
    });
    expect(result.fieldMismatches).toBe(0);
    expect(result.invalidDestinations).toBe(0);
  });

  it("adds every bad label and blocker without losing overlapping mismatch increments", async () => {
    const { page, expected } = fixture(41, true);
    const result = await readRowsFromPage(
      page,
      "https://candidate.example",
      expected,
      null,
      new AbortController().signal,
    );
    expect(result.rows).toHaveLength(41);
    expect(result.fieldMismatches).toBe(123);
  });

  it("retains malformed-row and destination failures beside valid peers", async () => {
    const { page, expected } = fixture(17, false);
    document.querySelector("tr[data-lease-id='3'] td")!.remove();
    document
      .querySelector("tr[data-lease-id='7'] a")!
      .setAttribute("href", "https://foreign.example/private");
    const result = await readRowsFromPage(
      page,
      "https://candidate.example",
      expected,
      null,
      new AbortController().signal,
    );
    expect(result.rows).toHaveLength(16);
    expect(result.rows.some((row) => row.leaseId === "3")).toBe(false);
    expect(result.invalidDestinations).toBe(2);
  });

  it("rejects a row-set change after the coherent snapshot was captured", async () => {
    const { page, expected } = fixture(17, false);
    Object.assign(page, {
      evaluate: async (read: (input: unknown) => unknown, input: unknown) => {
        const captured = read(input);
        const body = document.querySelector("tbody")!;
        body.appendChild(body.firstElementChild!.cloneNode(true));
        return captured;
      },
    });
    const result = await readRowsFromPage(
      page,
      "https://candidate.example",
      expected,
      null,
      new AbortController().signal,
    );
    expect(result.rows).toHaveLength(17);
    expect(result.fieldMismatches).toBe(1);
  });
});
