// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import {
  countFieldMismatches,
  readRowsFromPage,
} from "../../scripts/run-production-reconciliation";

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
      <td><a><time datetime="2027-01-31">01/31/2027</time></a></td><td><span>$1,000</span></td>
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
      .querySelector("tr[data-lease-id='7'] a.renewal-status-link")!
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

describe("S156 guidance contract marker on each rendered row", () => {
  const MARKER = "s156-staff-lane";

  it("captures the row marker, and null when the revision renders none", async () => {
    const { page, expected } = fixture(3, false);
    document
      .querySelector("tr[data-lease-id='2']")!
      .setAttribute("data-guidance-contract", MARKER);
    document
      .querySelector("tr[data-lease-id='3']")!
      .setAttribute("data-guidance-contract", "");
    const result = await readRowsFromPage(
      page,
      "https://candidate.example",
      expected,
      null,
      new AbortController().signal,
    );
    expect(result.rows.map((row) => row.guidanceContract)).toEqual([null, MARKER, ""]);
    expect(result.fieldMismatches).toBe(0);
  });

  it("reads a marked row's staff completion label against the staff-lane expectation", async () => {
    const complete = (marked: boolean) => {
      const built = fixture(1, false);
      const row = document.querySelector("tr[data-lease-id='1']")!;
      if (marked) row.setAttribute("data-guidance-contract", MARKER);
      row.setAttribute("data-status", "complete");
      const cell = row.querySelector("td[data-status]")!;
      cell.setAttribute("data-status", "complete");
      cell
        .querySelector("a")!
        .setAttribute(
          "href",
          "/lease-renewal/live/desk?v=2&overallStatus=complete&scope=all",
        );
      cell.querySelector(".renewal-status-badge > span")!.textContent =
        "Completed: recorded by staff";
      return built;
    };
    const rows = (staffComplete: boolean) =>
      [
        { leaseId: "1", workspaceExpected: false, manual: { complete: staffComplete } },
      ] as unknown as Parameters<typeof readRowsFromPage>[2];
    const read = async (
      marked: boolean,
      guidance?: Parameters<typeof readRowsFromPage>[5],
    ) =>
      (
        await readRowsFromPage(
          complete(marked).page,
          "https://candidate.example",
          // The predecessor expectation: this record is not complete under its rules.
          rows(false),
          null,
          new AbortController().signal,
          guidance,
        )
      ).fieldMismatches;

    // A marked row is read against the staff-lane expectation for the same lease.
    expect(await read(true, { staffLaneRows: rows(true) })).toBe(0);
    // An unmarked row keeps the predecessor expectation, whatever the staff lane expects.
    expect(await read(false, { staffLaneRows: rows(true) })).toBe(1);
    // The caller's contract outranks the rendered marker in both directions.
    expect(
      await read(false, { staffLaneRows: rows(true), expectedContract: MARKER }),
    ).toBe(0);
    expect(
      await read(true, { staffLaneRows: rows(true), expectedContract: "none" }),
    ).toBe(1);
  });
});

describe("independent semantic and displayed renewal-date evidence", () => {
  async function observedDate(markup: string) {
    const { page, expected } = fixture(1, false);
    document.querySelectorAll("tr[data-lease-id] td")[2].innerHTML = markup;
    const result = await readRowsFromPage(
      page,
      "https://candidate.example",
      expected,
      null,
      new AbortController().signal,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.fieldMismatches).toBe(0);
    expect(result.invalidDestinations).toBe(0);
    return result.rows[0];
  }

  const source = (endDate: string) => ({
    leaseId: "1",
    address: "Lease 1",
    owners: ["Owner 1"],
    tenants: ["Tenant 1"],
    endDate,
    baseRent: "$1,000",
    rentvineSourceUrl: null,
  });

  it.each([
    ["2027-01-31", "01/31/2027"],
    ["2028-02-29", "02/29/2028"],
    ["2000-02-29", "02/29/2000"],
    ["2026-12-31", "12/31/2026"],
    ["2027-01-01", "01/01/2027"],
    ["2026-03-08", "03/08/2026"],
    ["2026-11-01", "11/01/2026"],
  ])("matches exact source %s and its independent display %s", async (iso, display) => {
    const row = await observedDate(
      `<a><time datetime="${iso}">${display}</time></a><span class="renewal-td-secondary">Fixed term</span>`,
    );
    expect(row.endDate).toBe(iso);
    expect(countFieldMismatches(source(iso), row)).toBe(0);
  });

  it.each([
    '<a><time datetime="2027-01-30">01/31/2027</time></a>',
    '<a><time datetime="2027-01-30">01/30/2027</time></a>',
    '<a><time datetime="2027-01-31">2027-01-31</time></a>',
    '<a><time datetime="2027-01-31">1/31/2027</time></a>',
    '<a><time datetime="2027-01-31">01/30/2027</time></a>',
    '<a><time datetime="2027-01-31">Invalid date</time></a>',
    '<a><time datetime="2027-01-31">02/31/2027</time></a>',
    '<a><time datetime="2027-01-31"></time></a>',
    '<a><time datetime="">01/31/2027</time></a>',
    "<a><time>01/31/2027</time></a>",
    '<a><time datetime="2027-01-31T00:00:00Z">01/31/2027</time></a>',
    '<a><time datetime="2027-1-31">01/31/2027</time></a>',
    '<a><time datetime=" 2027-01-31 ">01/31/2027</time></a>',
    "<a>01/31/2027</a>",
    "<a>2027-01-31</a>",
    "<a>Needs Verification</a>",
    "<a></a>",
    "",
    '<a><time datetime="2027-01-31">01/31/2027</time><time datetime="2027-01-31">01/31/2027</time></a>',
    '<a><time datetime="2027-01-31">01/31/2027</time></a><span>01/31/2027</span>',
    '<a>01/31/2027</a><span class="renewal-td-secondary"><time datetime="2027-01-31">01/31/2027</time></span>',
  ])("rejects incorrect or ambiguous date markup %#", async (markup) => {
    const row = await observedDate(markup);
    expect(countFieldMismatches(source("2027-01-31"), row)).toBe(1);
  });

  it("requires the exact missing-date label and no time node", async () => {
    expect(
      countFieldMismatches(
        source("Needs Verification"),
        await observedDate(
          '<a>Needs Verification</a><span class="renewal-td-secondary">Month to month · review due 01/31/2027</span>',
        ),
      ),
    ).toBe(0);
    for (const markup of [
      "<a></a>",
      "<a>Not available</a>",
      "<a>Needs verification</a>",
      '<a><time datetime="">Needs Verification</time></a>',
      '<a><time datetime="2027-01-31">Needs Verification</time></a>',
      '<a>Needs Verification</a><time datetime="">Needs Verification</time>',
    ]) {
      expect(
        countFieldMismatches(source("Needs Verification"), await observedDate(markup)),
      ).toBe(1);
    }
  });

  it.each([
    "2027-02-29",
    "2100-02-29",
    "2026-04-31",
    "2026-00-10",
    "2026-13-10",
    "2026-01-00",
  ])(
    "preserves invalid source %s honestly without normalizing it into a real date",
    async (iso) => {
      expect(
        countFieldMismatches(
          source(iso),
          await observedDate(`<a><time datetime="${iso}">Invalid date</time></a>`),
        ),
      ).toBe(0);
      const [year, month, day] = iso.split("-");
      expect(
        countFieldMismatches(
          source(iso),
          await observedDate(
            `<a><time datetime="${iso}">${month}/${day}/${year}</time></a>`,
          ),
        ),
      ).toBe(1);
    },
  );

  it("keeps every non-date field comparison active after the corrected date passes", async () => {
    const row = await observedDate(
      '<a><time datetime="2027-01-31">01/31/2027</time></a>',
    );
    for (const changed of [
      { address: "Different synthetic address" },
      { owners: ["Different synthetic owner"] },
      { tenants: ["Different synthetic tenant"] },
      { baseRent: "$2,000" },
    ]) {
      expect(countFieldMismatches({ ...source("2027-01-31"), ...changed }, row)).toBe(1);
    }
  });
});
