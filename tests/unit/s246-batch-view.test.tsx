// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import {
  RenewalWorkingBatch,
  type RenewalWorkingBatchProps,
} from "@/components/lease-renewal/RenewalWorkingBatch";
import { buildDeskReturnHref } from "@/lib/lease-renewal/desk-view-continuation";
import {
  RENEWAL_BATCH_COUNT_GROUPS,
  RENEWAL_BATCH_GROUP_LABELS,
  type RenewalBatchCountGroup,
  type RenewalBatchQuery,
} from "@/lib/lease-renewal/renewal-batch";
import {
  projectRenewalBatchRows,
  type RenewalBatchRowView,
} from "@/lib/lease-renewal/renewal-batch-row";
import {
  S246_LEASES,
  S246_READ_TS,
  S246_RENEWED_CYCLE,
  S246_TODAY,
  loadS246Desk,
  s246Manual,
} from "@/tests/helpers/s246-portfolio";

// S246: the working batch as staff see it. The rows come from the one desk orchestration over the
// synthetic portfolio (November 5, 2026, so the working month is December 2026). The fetch seam
// is counted; nothing here reaches a server, a source or a provider.

const DESK = "/lease-renewal/live/desk";
const ROUTE = "/api/lease-renewal/workspace";

let fetchMock: ReturnType<typeof vi.fn>;
let rows: RenewalBatchRowView[];

function respond(ok: boolean, body: unknown = {}, status = ok ? 200 : 409) {
  return Promise.resolve({ ok, status, json: async () => body } as Response);
}

function posts(): Record<string, unknown>[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: (init as RequestInit).method,
    ...(JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>),
  }));
}

async function loadRows(options: Parameters<typeof loadS246Desk>[0] = {}) {
  const view = await loadS246Desk(options);
  return projectRenewalBatchRows(view.items, {
    sourceReadAtIso: S246_READ_TS,
    todayIso: S246_TODAY,
  });
}

/** Open the batch the way the page does: the address names the month and group it renders. */
function open(
  query: Partial<RenewalBatchQuery> = {},
  props: Partial<RenewalWorkingBatchProps> = {},
) {
  const initial: RenewalBatchQuery = { month: null, group: null, ...query };
  const search = new URLSearchParams();
  if (initial.month) search.set("batch", initial.month);
  if (initial.group) search.set("group", initial.group);
  const named = search.toString();
  window.history.replaceState(null, "", `${DESK}${named ? `?${named}` : ""}`);
  return render(
    <RenewalWorkingBatch
      initial={initial}
      rows={rows}
      todayIso={S246_TODAY}
      {...props}
    />,
  );
}

const address = (leaseId: string) => rows.find((row) => row.leaseId === leaseId)!.address;
/** The row's own link text: the address, with the unit when the lease has one. */
const title = (leaseId: string) => {
  const row = rows.find((entry) => entry.leaseId === leaseId)!;
  return row.unit ? `${row.address}, ${row.unit}` : row.address;
};
const leaseIds = (scope: Element) =>
  [...scope.querySelectorAll("li[data-batch-lease]")].map((row) =>
    row.getAttribute("data-batch-lease"),
  );
const list = (group: "carried_over" | "this_batch") =>
  document.querySelector<HTMLElement>(`[data-batch-list="${group}"]`);
const batchRow = (scope: ParentNode, leaseId: string) =>
  scope.querySelector<HTMLElement>(`li[data-batch-lease="${leaseId}"]`)!;
const countButton = (group: RenewalBatchCountGroup) =>
  document.querySelector<HTMLButtonElement>(`button[data-batch-group="${group}"]`)!;
const summary = () => document.querySelector(".renewal-batch-summary")!;

/** Follow a link without letting jsdom try to navigate. */
function follow(element: HTMLElement) {
  element.addEventListener("click", (event) => event.preventDefault(), { once: true });
  fireEvent.click(element);
}

beforeEach(async () => {
  rows = await loadRows();
  router.refresh.mockClear();
  window.sessionStorage.clear();
  fetchMock = vi.fn(() => respond(true, { duplicate: false }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("S246 the working batch is the default view (R-S246-2, R-S246-3, R-S246-6, R-S246-11)", () => {
  it("BEH-S246-1: states the working month and its count in words above the list, with Carried over first and every other lease as a count", () => {
    open();
    expect(summary()).toHaveTextContent(
      "Three leases ending in December 2026 need renewal work.",
    );
    expect(screen.getByText("Working month: December 2026")).toBeInTheDocument();
    const carried = screen.getByRole("region", { name: "Carried over" });
    const batch = screen.getByRole("region", { name: "This batch" });
    // The words come before both lists, and Carried over shows first.
    expect(
      summary().compareDocumentPosition(carried) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      carried.compareDocumentPosition(batch) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // R-S246-3: oldest end date first.
    expect(leaseIds(carried)).toEqual([
      S246_LEASES.endedWithoutOutcome,
      S246_LEASES.endingThisMonth,
    ]);
    expect(leaseIds(batch)).toEqual([
      S246_LEASES.activeInMonth,
      S246_LEASES.activeInMonthSecond,
      S246_LEASES.statusUnreadable,
    ]);
    // Closed and pending leases are counted, never listed as renewal work.
    for (const scope of [carried, batch]) {
      expect(leaseIds(scope)).not.toContain(S246_LEASES.closed);
      expect(leaseIds(scope)).not.toContain(S246_LEASES.pending);
    }
    const counts = Object.fromEntries(
      RENEWAL_BATCH_COUNT_GROUPS.map((group) => [
        group,
        Number(countButton(group).getAttribute("data-batch-count")),
      ]),
    );
    expect(counts).toEqual({
      renewed_in_rentvine: 1,
      month_to_month_reviews: 1,
      non_renewals: 1,
      coming_up_later: 2,
      not_targets: 5,
      completed: 1,
    });
    for (const group of RENEWAL_BATCH_COUNT_GROUPS) {
      expect(countButton(group)).toHaveAccessibleName(
        `${RENEWAL_BATCH_GROUP_LABELS[group]} ${counts[group]}`,
      );
      expect(countButton(group)).toHaveAttribute("aria-expanded", "false");
    }
    // R-S246-11: the two lists and the counts add up to every loaded lease.
    const listed = leaseIds(carried).length + leaseIds(batch).length;
    const counted = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const root = screen.getByRole("region", { name: "Working batch" });
    expect(listed + counted).toBe(rows.length);
    expect(root).toHaveAttribute("data-batch-total", String(rows.length));
    expect(root).toHaveAttribute("data-batch-month", "2026-12");
    // Opening the batch records nothing.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("R-S246-2: Previous month and Next month change the month, its words and its lists, and the address follows", () => {
    open();
    // The month links change the batch in place (the view itself stops the page navigation).
    const choose = (name: string) =>
      expect(fireEvent.click(screen.getByRole("link", { name }))).toBe(false);
    choose("Next month");
    expect(window.location.search).toBe("?batch=2027-01");
    expect(summary()).toHaveTextContent(
      "No leases ending in January 2027 need renewal work.",
    );
    expect(screen.getByText("Nothing is listed for January 2027.")).toBeInTheDocument();
    // December's targets are now earlier months without a completion.
    expect(leaseIds(list("carried_over")!)).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Return to December 2026" })).toHaveAttribute(
      "href",
      DESK,
    );

    choose("Previous month");
    // The default month is the plain batch address.
    expect(`${window.location.pathname}${window.location.search}`).toBe(DESK);
    expect(screen.queryByRole("link", { name: /^Return to/ })).toBeNull();
    choose("Previous month");
    expect(window.location.search).toBe("?batch=2026-11");
    expect(summary()).toHaveTextContent(
      "One lease ending in November 2026 needs renewal work.",
    );
    expect(leaseIds(list("this_batch")!)).toEqual([S246_LEASES.endingThisMonth]);
    expect(leaseIds(list("carried_over")!)).toEqual([S246_LEASES.endedWithoutOutcome]);

    // The browser's own Back and Forward move the batch too.
    act(() => {
      window.history.replaceState(null, "", `${DESK}?batch=2027-02`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(summary()).toHaveTextContent(
      "One lease ending in February 2027 needs renewal work.",
    );
    // Each month link is a real address, so it also opens in a new tab on request.
    expect(screen.getByRole("link", { name: "Next month" })).toHaveAttribute(
      "href",
      `${DESK}?batch=2027-03`,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("R-S246-4 / R-S246-6: each count opens its rows; an excluded lease shows its reason and still opens", () => {
    open();
    expect(screen.queryByRole("region", { name: "Not renewal targets" })).toBeNull();
    fireEvent.click(countButton("not_targets"));
    expect(window.location.search).toBe("?group=not_targets");
    expect(countButton("not_targets")).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("region", { name: "Not renewal targets" });
    expect(new Set(leaseIds(panel))).toEqual(
      new Set([
        S246_LEASES.closed,
        S246_LEASES.pending,
        S246_LEASES.program,
        S246_LEASES.ownerHold,
        S246_LEASES.noEndDate,
      ]),
    );
    // Each exclusion is counted with its reason; RentVine's own status name is the reason.
    for (const reason of [
      "RentVine reports Closed: 1",
      "RentVine reports Future: 1",
      "Program lease: 1",
      "Owner-authorized hold: 1",
      "No end date on file: 1",
    ])
      expect(within(panel).getByText(reason)).toBeInTheDocument();
    const closed = batchRow(panel, S246_LEASES.closed);
    expect(closed).toHaveAttribute("data-batch-row-kind", "context");
    expect(within(closed).getByText("RentVine reports Closed")).toBeInTheDocument();
    // AC-S246-3 / S154: it opens like any lease, with no renewal next step invented for it.
    expect(closed.querySelector(".renewal-batch-stage")).toBeNull();
    const openLease = within(closed).getByRole("link", { name: "Open the lease" });
    expect(openLease).toHaveAttribute(
      "href",
      `${DESK}/lease/${S246_LEASES.closed}?deskView=group%3Dnot_targets`,
    );
    expect(openLease).not.toHaveAttribute("target");
    expect(within(closed).queryByRole("button")).toBeNull();

    // Choosing the count again closes its rows.
    fireEvent.click(countButton("not_targets"));
    expect(countButton("not_targets")).toHaveAttribute("aria-expanded", "false");
    expect(`${window.location.pathname}${window.location.search}`).toBe(DESK);

    const expected: [RenewalBatchCountGroup, string[]][] = [
      ["month_to_month_reviews", [S246_LEASES.monthToMonthDue]],
      ["non_renewals", [S246_LEASES.moveOut]],
      ["coming_up_later", [S246_LEASES.activeLater, S246_LEASES.monthToMonthLater]],
      ["completed", [S246_LEASES.completed]],
    ];
    for (const [group, ids] of expected) {
      fireEvent.click(countButton(group));
      const opened = screen.getByRole("region", {
        name: RENEWAL_BATCH_GROUP_LABELS[group],
      });
      expect(leaseIds(opened), group).toEqual(ids);
    }
    // Only one count is open at a time.
    expect(document.querySelectorAll("[data-batch-open-group]")).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("R-S246-9: All leases and filters opens the full table, and a saved view is offered by its own link", () => {
    const first = open();
    expect(screen.getByRole("link", { name: "All leases and filters" })).toHaveAttribute(
      "href",
      `${DESK}?v=2&scope=all`,
    );
    expect(screen.queryByRole("link", { name: "Open my saved view" })).toBeNull();
    first.unmount();
    const saved = `${DESK}?v=2&sort=end_date&direction=desc&scope=all`;
    open({}, { savedViewHref: saved });
    expect(screen.getByRole("link", { name: "Open my saved view" })).toHaveAttribute(
      "href",
      saved,
    );
  });
});

describe("S246 one short row and opening a lease (R-S246-7, R-S246-8, BEH-S246-3)", () => {
  it("a batch row shows address, tenant names as text, end date, one stage line, one next step and at most three tags", () => {
    open();
    const row = batchRow(list("this_batch")!, S246_LEASES.activeInMonth);
    expect(row).toHaveAttribute("data-batch-row-kind", "work");
    const href = `${DESK}/lease/${S246_LEASES.activeInMonth}?step=owner-decision#renewal-manual-owner_outreach`;
    const links = within(row).getAllByRole("link");
    // The row's own link and its one next step; both open the lease at its current step.
    expect(links.map((link) => link.textContent)).toEqual([
      title(S246_LEASES.activeInMonth),
      "Owner outreach",
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute("href", href);
      // R-S246-8: the same tab.
      expect(link).not.toHaveAttribute("target");
    }
    expect(row.querySelectorAll("[data-batch-next-step]")).toHaveLength(1);
    // Names are text here; name filters stay in the full table.
    expect(within(row).getByText("Avery Example").closest("a")).toBeNull();
    expect(within(row).getByText("Ends 12/31/2026")).toBeInTheDocument();
    const stage = row.querySelectorAll(".renewal-batch-stage");
    expect(stage).toHaveLength(1);
    expect(stage[0]).toHaveTextContent(
      "Ready, waiting on the PMI KC team, nothing recorded yet",
    );
    expect(row.querySelectorAll("[data-batch-tag]").length).toBeLessThanOrEqual(3);
    expect(within(row).queryByRole("button")).toBeNull();
    // No row anywhere in the batch carries a name filter or opens a second tab.
    for (const anchor of document.querySelectorAll("a[href]")) {
      expect(anchor.getAttribute("href")).not.toMatch(/ownerKey|tenantKey/);
      expect(anchor).not.toHaveAttribute("target");
    }
  });

  it("R-S246-12: a lease whose RentVine status could not be read stays listed with the label", async () => {
    const first = open();
    const unread = batchRow(list("this_batch")!, S246_LEASES.statusUnreadable);
    expect(within(unread).getByText("RentVine status unavailable")).toBeInTheDocument();
    expect(
      within(batchRow(list("this_batch")!, S246_LEASES.activeInMonth)).queryByText(
        "RentVine status unavailable",
      ),
    ).toBeNull();
    first.unmount();

    // BEH-S246-5: with the whole status table unreadable nothing is counted closed or pending.
    rows = await loadRows({ statuses: "unavailable" });
    open();
    const listed = [...leaseIds(list("carried_over")!), ...leaseIds(list("this_batch")!)];
    expect(listed).toEqual(
      expect.arrayContaining([S246_LEASES.closed, S246_LEASES.pending]),
    );
    for (const id of listed)
      expect(
        within(batchRow(document, id!)).getByText("RentVine status unavailable"),
        String(id),
      ).toBeInTheDocument();
    expect(countButton("not_targets")).toHaveAttribute("data-batch-count", "3");
    expect(screen.getByRole("region", { name: "Working batch" })).toHaveAttribute(
      "data-batch-total",
      "16",
    );
  });

  it("BEH-S246-3: a lease link carries the month and group it was opened from, and Back to renewals rebuilds exactly that batch", () => {
    open({ month: "2027-01", group: "coming_up_later" });
    const panel = screen.getByRole("region", { name: "Coming up later" });
    const link = within(batchRow(panel, S246_LEASES.activeLater)).getAllByRole("link")[0];
    const href = new URL(link.getAttribute("href")!, "https://app.example.invalid");
    expect(href.pathname).toBe(`${DESK}/lease/${S246_LEASES.activeLater}`);
    const carried = href.searchParams.get("deskView");
    expect(carried).toBe("batch=2027-01&group=coming_up_later");
    expect(buildDeskReturnHref(carried)).toBe(
      `${DESK}?batch=2027-01&group=coming_up_later`,
    );
    // The plain batch carries nothing, and Back to renewals is then the bare desk route.
    cleanup();
    open();
    const plain = within(
      batchRow(list("this_batch")!, S246_LEASES.activeInMonth),
    ).getAllByRole("link")[0];
    expect(plain.getAttribute("href")).not.toContain("deskView");
    expect(buildDeskReturnHref(null)).toBe(DESK);
  });

  it("BEH-S246-3: returning restores the scroll position and the row the lease was opened from, once", () => {
    const scrollTo = vi.mocked(window.scrollTo);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 640 });
    const first = open({ month: "2027-01", group: "coming_up_later" });
    follow(
      within(
        batchRow(
          screen.getByRole("region", { name: "Coming up later" }),
          S246_LEASES.activeLater,
        ),
      ).getAllByRole("link")[0],
    );
    first.unmount();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    expect(scrollTo).not.toHaveBeenCalled();

    // Back to renewals renders the same month and group again.
    const back = open({ month: "2027-01", group: "coming_up_later" });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 640);
    expect(document.activeElement).toBe(
      within(
        batchRow(
          screen.getByRole("region", { name: "Coming up later" }),
          S246_LEASES.activeLater,
        ),
      ).getAllByRole("link")[0],
    );
    back.unmount();
    // The noted position is used once; a later visit starts at the top.
    open({ month: "2027-01", group: "coming_up_later" });
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("a position noted for another month or group is never applied", () => {
    const scrollTo = vi.mocked(window.scrollTo);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 480 });
    const first = open();
    follow(
      within(batchRow(list("this_batch")!, S246_LEASES.activeInMonth)).getAllByRole(
        "link",
      )[0],
    );
    first.unmount();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    open({ month: "2027-01" });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("S246 renewed in RentVine, confirm and close (R-S246-5, BEH-S246-2)", () => {
  const renewed = () =>
    batchRow(
      screen.getByRole("region", { name: "Renewed in RentVine, confirm and close" }),
      S246_LEASES.renewedInSource,
    );
  const choiceBody = (operation: string) => ({
    url: ROUTE,
    method: "POST",
    operation,
    leaseId: S246_LEASES.renewedInSource,
    recordedDateIso: "2026-12-31",
    sourceDateIso: "2027-12-31",
    operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    // A confirmation names the work record version the row showed; keep working does not.
    ...(operation === "confirm_source_renewal"
      ? {
          cycleId: S246_RENEWED_CYCLE,
          expectedRevision: s246Manual().get(S246_LEASES.renewedInSource)!.revision,
        }
      : {}),
  });

  it("offers both choices and completes nothing by itself", () => {
    open({ group: "renewed_in_rentvine" }, { canRecord: true });
    const row = renewed();
    expect(
      within(row).getByRole("button", { name: "Record staff completion" }),
    ).toBeEnabled();
    expect(within(row).getByRole("button", { name: "Keep working" })).toBeEnabled();
    expect(within(row).getByRole("link", { name: "Open the lease" })).toHaveAttribute(
      "href",
      `${DESK}/lease/${S246_LEASES.renewedInSource}?deskView=group%3Drenewed_in_rentvine`,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("recording staff completion asks first, shows both dates, and records only on the staff confirmation", async () => {
    open({ group: "renewed_in_rentvine" }, { canRecord: true });
    fireEvent.click(
      within(renewed()).getByRole("button", { name: "Record staff completion" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: `Record staff completion for ${address(S246_LEASES.renewedInSource)}?`,
    });
    expect(dialog).toHaveTextContent("This cycle recorded lease end 12/31/2026.");
    expect(dialog).toHaveTextContent("RentVine now reports lease end 12/31/2027.");
    expect(fetchMock).not.toHaveBeenCalled();
    // Cancel records nothing.
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(
      within(renewed()).getByRole("button", { name: "Record staff completion" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Record staff completion",
      }),
    );
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(posts()).toEqual([choiceBody("confirm_source_renewal")]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      screen.getByText(
        `Staff completion recorded for ${address(S246_LEASES.renewedInSource)}, with RentVine lease end 12/31/2027 as the evidence.`,
      ),
    ).toBeInTheDocument();
  });

  it("keep working records the decision from one staff click and refreshes the batch", async () => {
    open({ group: "renewed_in_rentvine" }, { canRecord: true });
    fireEvent.click(within(renewed()).getByRole("button", { name: "Keep working" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(posts()).toEqual([choiceBody("keep_working")]);
    expect(
      screen.getByText(
        `${address(S246_LEASES.renewedInSource)} stays in the batch for the cycle recorded 12/31/2026.`,
      ),
    ).toBeInTheDocument();
  });

  it("a refusal says what happened, records nothing more and reloads the batch", async () => {
    fetchMock.mockImplementation(() =>
      respond(false, {
        error:
          "This lease changed since the page was opened, so nothing was recorded. Reload Renewals and choose again.",
      }),
    );
    open({ group: "renewed_in_rentvine" }, { canRecord: true });
    fireEvent.click(
      within(renewed()).getByRole("button", { name: "Record staff completion" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Record staff completion",
      }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("nothing was recorded");
    // The dialog stays open with the reason; the batch reloads behind it.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a lost response is finished by choosing again with the same operation, so it is recorded once", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("network")));
    open({ group: "renewed_in_rentvine" }, { canRecord: true });
    fireEvent.click(within(renewed()).getByRole("button", { name: "Keep working" }));
    expect(
      await screen.findByText(/it is not yet known whether this was recorded/),
    ).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
    fireEvent.click(within(renewed()).getByRole("button", { name: "Keep working" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    const [first, second] = posts();
    expect(first.operationId).toBe(second.operationId);
    expect(second).toEqual(choiceBody("keep_working"));
  });

  it("an account that cannot record, or lease data past its limit, is offered no recording action that works", () => {
    const readOnly = open({ group: "renewed_in_rentvine" }, { canRecord: false });
    expect(within(renewed()).queryByRole("button")).toBeNull();
    expect(
      screen.getByText(
        /Recording a completion or a keep-working choice needs Editor access/,
      ),
    ).toBeInTheDocument();
    // The lease still opens.
    expect(within(renewed()).getByRole("link", { name: "Open the lease" })).toBeVisible();
    readOnly.unmount();

    open({ group: "renewed_in_rentvine" }, { canRecord: true, recordingPaused: true });
    for (const name of ["Record staff completion", "Keep working"])
      expect(within(renewed()).getByRole("button", { name })).toBeDisabled();
    expect(screen.getByText(/Recording is paused/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says so when keep-working choices could not be read for this render", () => {
    open(
      { group: "renewed_in_rentvine" },
      { canRecord: true, decisionsAvailable: false },
    );
    expect(
      screen.getByText(/Keep-working choices could not be read just now/),
    ).toBeInTheDocument();
  });
});

describe("S246 the batch derives no effect (AC-S246-3)", () => {
  const code = (path: string) =>
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");

  it("the batch view reaches one route, the existing workspace save, and only from the two staff choices", () => {
    const view = code("components/lease-renewal/RenewalWorkingBatch.tsx");
    expect(view.match(/fetchWithDeadline\(/g)).toHaveLength(1);
    expect(view.match(/\bfetch\(/g)).toBeNull();
    expect(view).toContain('const WORKSPACE_ROUTE = "/api/lease-renewal/workspace"');
    expect(view.match(/\/api\//g)).toHaveLength(1);
    expect(view).not.toMatch(/from "@\/lib\/(firestore|integrations|gmail|assistant)/);
  });

  it("the target definition, the partition and the row projection are pure: no store, provider, mail or schedule import", () => {
    for (const path of [
      "lib/lease-renewal/renewal-target.ts",
      "lib/lease-renewal/renewal-batch.ts",
      "lib/lease-renewal/renewal-batch-row.ts",
      "lib/lease-renewal/cycle-date-decision.ts",
    ]) {
      const imports = code(path)
        .split("\n")
        .filter(
          (line) => /^\s*(import|export) .* from "/.test(line) || /^} from "/.test(line),
        );
      for (const line of imports)
        expect(line, `${path}: ${line}`).not.toMatch(
          /@\/lib\/(firestore|integrations|gmail|gmail-hub|communications|execution|external-execution|scheduler)|firebase|googleapis/,
        );
      expect(code(path), path).not.toMatch(/\bfetch\(|runTransaction|getAdminFirestore/);
    }
  });
});
