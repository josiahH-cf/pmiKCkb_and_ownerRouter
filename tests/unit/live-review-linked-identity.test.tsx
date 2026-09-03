// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveRenewalReview } from "@/components/lease-renewal/LiveRenewalReview";
import type { LeaseRenewalResolutionRecord } from "@/lib/firestore/types";
import {
  LIVE_REVIEW_RUN_ID,
  loadLiveRenewalReview,
  rebuildLiveRenewalRun,
} from "@/lib/lease-renewal/live-review";
import { loadLiveRenewalLeaseWorkspace } from "@/lib/lease-renewal/live-desk";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
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
  it("keeps the linked trigger, exact card destination, rebuild, and persisted resolution aligned", async () => {
    const timestamp = "2026-09-02T12:00:00.000Z";
    const initial = await loadLiveRenewalReview(timestamp);
    expect(initial.status).toBe("ok");
    if (initial.status !== "ok") return;

    const currentRentFlag = flags(initial.view).find(
      (flag) => flag.fieldKey === "current_rent",
    );
    expect(currentRentFlag).toBeDefined();
    const sourceTriggerKey = currentRentFlag!.sourceTriggerKey;
    const itemId = liveRenewalReviewItemId(sourceTriggerKey)!;
    expect(sourceTriggerKey).toMatch(
      /^lease_renewal:reconcile:live-review:[a-f0-9]{16}:current_rent$/,
    );
    expect(buildLiveRenewalReviewItemHref(sourceTriggerKey)).toBe(
      `/lease-renewal/live#${itemId}`,
    );

    const rebuilt = await rebuildLiveRenewalRun(timestamp);
    const rebuiltOutcome = rebuilt?.flags.find(
      (outcome) => outcome.fieldKey === "current_rent",
    );
    expect(rebuiltOutcome?.queueMapping?.queueItem.source_trigger_key).toBe(
      sourceTriggerKey,
    );
    expect(rebuiltOutcome?.candidateFingerprint).toMatch(/^rcf1_[a-f0-9]{64}$/);

    const resolution: LeaseRenewalResolutionRecord = {
      id: "synthetic-resolution-receipt",
      source_trigger_key: sourceTriggerKey,
      run_id: LIVE_REVIEW_RUN_ID,
      field_key: "current_rent",
      field_label: currentRentFlag!.fieldLabel,
      severity: currentRentFlag!.severity,
      status: "Resolved",
      property_key: currentRentFlag!.propertyKey,
      candidate_fingerprint: rebuiltOutcome!.candidateFingerprint,
      resolution_kind: "pick_source",
      chosen_source: "rentvine",
      proposed_writeback: {
        field_key: "current_rent",
        value: "1400",
        source_of_value: "rentvine",
        status: "Queued",
        production_allowed: false,
      },
      reason: "Synthetic exact-identity regression fixture.",
      resolved_by_uid: "synthetic-admin",
      created_at: timestamp,
      updated_at: timestamp,
    };
    const withResolution = await loadLiveRenewalReview(timestamp, {
      resolutions: [resolution],
    });
    expect(withResolution.status).toBe("ok");
    if (withResolution.status !== "ok") return;

    const resolvedFlag = flags(withResolution.view).find(
      (flag) => flag.sourceTriggerKey === sourceTriggerKey,
    );
    expect(resolvedFlag?.resolution).toMatchObject({
      receiptId: resolution.id,
      status: "Resolved",
    });
    expect(withResolution.view.resolvedCount).toBe(1);

    const workspace = await loadLiveRenewalLeaseWorkspace(
      "777",
      timestamp,
      mocks.buildLiveRenewalConfig(),
      null,
      null,
      [resolution],
    );
    expect(workspace.status).toBe("ok");
    if (workspace.status !== "ok") return;
    expect(
      workspace.workspace.dataCheck.find((item) => item.fieldKey === "current_rent")
        ?.sourceTriggerKey,
    ).toBe(sourceTriggerKey);
    expect(
      workspace.workspace.dataCheck.find((item) => item.fieldKey === "current_rent")
        ?.candidateFingerprint,
    ).toBe(rebuiltOutcome?.candidateFingerprint);
    expect(
      workspace.workspace.ownerDraft.facts.find((fact) => fact.key === "current_rent"),
    ).toMatchObject({ value: "$1,400", confidence: "Verified" });

    render(
      <LiveRenewalReview
        canResolve={false}
        isAdmin={false}
        meta={withResolution.meta}
        resolutionsError={false}
        view={withResolution.view}
      />,
    );
    expect(document.getElementById(itemId)).toBeInTheDocument();
  });
});
