const noticeReader = {
  uid: "fixture-reader",
  email: "fixture-reader@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
vi.mock("@/lib/firestore/renewal-notice-safety", () => ({
  withRenewalNoticeAdmission: (_actor: unknown, reader: object) => reader,
}));
// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveRenewalReview } from "@/components/lease-renewal/LiveRenewalReview";
import {
  LIVE_REVIEW_RUN_ID,
  loadLiveRenewalReview,
  rebuildLiveRenewalRun,
} from "@/lib/lease-renewal/live-review";
import { loadLiveRenewalLeaseWorkspace } from "@/lib/lease-renewal/live-desk";
import {
  clearLiveLeaseCache,
  LEASE_EXPORT_TTL_MS,
  LEASE_EXPORT_MAX_AGE_MS,
} from "@/lib/lease-renewal/live-lease-cache";
import { withFakeLeaseDetail } from "@/tests/helpers/rentvine-detail-fake";
import {
  buildLiveRenewalReviewItemHref,
  liveRenewalReviewItemId,
} from "@/lib/lease-renewal/live-review-destination";
import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";

const mocks = vi.hoisted(() => ({
  buildLiveRenewalConfig: vi.fn(),
}));

vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRenewalConfig: mocks.buildLiveRenewalConfig,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function flags(view: RenewalRunView): RenewalFlagView[] {
  return view.groups.flatMap((group) => group.flags);
}

const HEADER = SAMPLE_RENEWAL_TABLES[0][0] as readonly string[];
const TENANT_COLUMN = HEADER.findIndex((value) =>
  value.toLowerCase().includes("tenant name"),
);
const CURRENT_RENT_COLUMN = HEADER.findIndex((value) =>
  value.toLowerCase().includes("current rent"),
);

function row(overrides: Record<number, string>): string[] {
  const value = Array.from({ length: HEADER.length }, () => "");
  for (const [index, cell] of Object.entries(overrides)) value[Number(index)] = cell;
  return value;
}

const evaluatedRow = row({
  [TENANT_COLUMN]: "Sheet-only spelling",
  [CURRENT_RENT_COLUMN]: "$1,300",
});
const formulaRow = row({
  [TENANT_COLUMN]:
    '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/777","Sheet-only spelling")',
  [CURRENT_RENT_COLUMN]: "$1,300",
});

beforeEach(() => {
  clearLiveLeaseCache();
  mocks.buildLiveRenewalConfig.mockReturnValue({
    ok: true,
    spreadsheetId: "synthetic-sheet",
    rentvineHost: "pmikcmetro.rentvine.com",
    rentvineClient: withFakeLeaseDetail({
      async listAllLeasesExport() {
        return {
          rows: [
            {
              lease: {
                leaseID: 777,
                endDate: "2026-08-31",
                tenants: [{ name: "Different RentVine spelling" }],
              },
              unit: { rent: "1400" },
            },
          ],
          pages: 1,
          complete: true,
        };
      },
    }),
    sheetsReader: {
      async listTabTitles() {
        return ["Lease Renewal"];
      },
      async batchGet() {
        return {
          valueRanges: [
            { range: "Lease Renewal", values: [HEADER.map(String), evaluatedRow] },
          ],
        };
      },
      async batchGetFormulas() {
        return {
          valueRanges: [
            { range: "Lease Renewal", values: [HEADER.map(String), formulaRow] },
          ],
        };
      },
    },
  });
});

afterEach(() => {
  cleanup();
  clearLiveLeaseCache();
  mocks.buildLiveRenewalConfig.mockReset();
});

describe("Live review linked record identity", () => {
  it.each([
    ["stale", LEASE_EXPORT_TTL_MS + 1],
    ["expired", LEASE_EXPORT_MAX_AGE_MS + 1],
  ] as const)(
    "retains %s source age after refresh failure and holds decisions without an all-clear claim",
    async (state, age) => {
      const timestamp = "2026-09-02T12:00:00.000Z";
      const sourceRead = vi.spyOn(
        mocks.buildLiveRenewalConfig().rentvineClient,
        "listAllLeasesExport",
      );
      expect((await loadLiveRenewalReview(noticeReader, timestamp)).status).toBe("ok");
      expect(sourceRead).toHaveBeenCalledTimes(1);
      const config = mocks.buildLiveRenewalConfig();
      config.rentvineClient.listAllLeasesExport = vi.fn(async () => {
        throw new Error("synthetic provider refresh failed");
      });
      const later = new Date(Date.parse(timestamp) + age).toISOString();
      const retained = await loadLiveRenewalReview(noticeReader, later, {});
      expect(retained.status).toBe("ok");
      if (retained.status !== "ok") throw new Error("Expected retained source rows");
      expect(retained.meta).toMatchObject({ currencyState: state, readAtIso: timestamp });
      expect(await rebuildLiveRenewalRun(noticeReader, later)).toBeNull();
      render(
        <LiveRenewalReview
          view={retained.view}
          meta={retained.meta}
          canResolve
          canDefer
          isAdmin
          resolutionsError={false}
        />,
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        `Retained RentVine facts are ${state}`,
      );
      expect(screen.queryByRole("button", { name: /Approve|Resolve|Defer/ })).toBeNull();
      expect(screen.queryByText("No open items")).toBeNull();
    },
  );

  it("performs no provider or Sheet read when source admission fails", async () => {
    const config = mocks.buildLiveRenewalConfig();
    const exportRead = vi.fn();
    const sheetRead = vi.spyOn(config.sheetsReader, "batchGet");
    config.rentvineClient.listAllLeasesExport = exportRead;
    config.rentvineClient.beforeLeaseSourceRead = async () => {
      throw new Error("synthetic admission refused");
    };
    await expect(
      loadLiveRenewalReview(noticeReader, "2026-09-02T12:00:00.000Z"),
    ).resolves.toEqual({ status: "read_error" });
    expect(exportRead).not.toHaveBeenCalled();
    expect(sheetRead).not.toHaveBeenCalled();
  });

  // S280 R-S280-6 (rewritten on purpose): the operating Sheet's $1,300 against RentVine's $1,400 is
  // information, not a decision. The linked identity still lines up: Live review's information row,
  // the rebuilt run, the lease's data check and the item link share one key, and the lease's own
  // current rent stands on RentVine with no resolution.
  it("S280 R-S280-6: keeps the linked identity aligned for a Sheet rent difference that is information", async () => {
    const timestamp = "2026-09-02T12:00:00.000Z";
    const initial = await loadLiveRenewalReview(noticeReader, timestamp);
    expect(initial.status).toBe("ok");
    if (initial.status !== "ok") return;

    expect(flags(initial.view).find((flag) => flag.fieldKey === "current_rent")).toBe(
      undefined,
    );
    const information = (initial.view.information ?? []).find(
      (row) => row.fieldKey === "current_rent",
    );
    expect(information).toBeDefined();
    const sourceTriggerKey = information!.key;
    const itemId = liveRenewalReviewItemId(sourceTriggerKey)!;
    expect(sourceTriggerKey).toMatch(
      /^lease_renewal:reconcile:live-review:[a-f0-9]{16}:current_rent$/,
    );
    expect(information!.line).toBe(
      `${information!.leaseLabel}: the operating Sheet shows $1,300.00 and RentVine shows $1,400.00. RentVine is the basis.`,
    );
    expect(buildLiveRenewalReviewItemHref(sourceTriggerKey)).toBe(
      `/lease-renewal/live#${itemId}`,
    );

    const rebuilt = await rebuildLiveRenewalRun(noticeReader, timestamp);
    expect(rebuilt?.runId).toBe(LIVE_REVIEW_RUN_ID);
    expect(rebuilt?.flags.find((outcome) => outcome.fieldKey === "current_rent")).toBe(
      undefined,
    );
    expect(
      rebuilt?.outcomes.find((outcome) => outcome.fieldKey === "current_rent")
        ?.informationKey,
    ).toBe(sourceTriggerKey);

    const workspace = await loadLiveRenewalLeaseWorkspace(
      "777",
      timestamp,
      mocks.buildLiveRenewalConfig(),
      null,
      null,
      [],
    );
    expect(workspace.status).toBe("ok");
    if (workspace.status !== "ok") return;
    const rentCheck = workspace.workspace.dataCheck.find(
      (item) => item.fieldKey === "current_rent",
    );
    expect(rentCheck?.agreement).toBe("agree");
    expect(rentCheck?.sourceTriggerKey).toBe(sourceTriggerKey);
    expect(
      workspace.workspace.ownerDraft.facts.find((fact) => fact.key === "current_rent"),
    ).toMatchObject({ value: "$1,400", confidence: "Verified" });

    render(
      <LiveRenewalReview
        canResolve={false}
        isAdmin={false}
        meta={initial.meta}
        resolutionsError={false}
        view={initial.view}
      />,
    );
    expect(document.getElementById(itemId)).toBeInTheDocument();
    expect(screen.getByText(information!.line)).toBeInTheDocument();
  });
});
