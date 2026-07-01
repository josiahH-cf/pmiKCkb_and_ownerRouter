// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import { LiveRenewalReview } from "@/components/lease-renewal/LiveRenewalReview";
import { getRenewalDeskView } from "@/lib/lease-renewal/sample-desk";
import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import {
  categorizeLiveReviewError,
  type LiveReviewMeta,
} from "@/lib/lease-renewal/live-review";
import type { RenewalRunView } from "@/lib/lease-renewal/run-view";
import { RentVineAuthError } from "@/lib/integrations/rentvine/client";

afterEach(() => {
  cleanup();
});

// A synthetic view (no real PII) shaped exactly like buildRenewalRunView's output.
const SAMPLE_VIEW: RenewalRunView = {
  runId: "live-review",
  label: "Live renewal review",
  manifest: {
    tabsRecognized: 1,
    tabsUnrecognized: 0,
    credentialTabsExcluded: 0,
    credentialScrubHits: 0,
    dividerRowsDropped: 0,
    totalRecords: 25,
  },
  excludedTabs: [],
  totalFlags: 1,
  resolvedCount: 0,
  groups: [
    {
      severity: "High",
      flags: [
        {
          sourceTriggerKey: "trigger-1",
          fieldKey: "renewal_date",
          fieldLabel: "Lease end date",
          severity: "High",
          agreement: "conflict",
          actionNeeded:
            "Two sources disagree on the lease end date — confirm which is right.",
          directLink: "/lease-renewal/live",
          suggestedWinner: null,
          candidates: [
            {
              source: "rentvine",
              sourceSystem: "RentVine",
              value: "2026-08-31",
              confidence: "Verified",
            },
            {
              source: "sheet",
              sourceSystem: "Sheet",
              value: "2026-09-30",
              confidence: "Needs Verification",
            },
          ],
          resolution: null,
          writeback: null,
        },
      ],
    },
  ],
};

const SAMPLE_META: LiveReviewMeta = {
  sheetTabsRead: 1,
  liveRentvineCandidates: 25,
  skippedLeases: 0,
  productionAllowed: false,
};

describe("LiveRenewalReview", () => {
  it("renders the live chip, the conflict item with both source values, and read-only posture", () => {
    render(<LiveRenewalReview meta={SAMPLE_META} view={SAMPLE_VIEW} />);

    expect(
      screen.getByRole("heading", { name: "Live renewal review", level: 1 }),
    ).toBeInTheDocument();
    // Unmistakably live data, not sample.
    expect(screen.getByText("Live data")).toBeInTheDocument();
    expect(screen.queryByText("Sample data")).not.toBeInTheDocument();

    // The reconciliation item shows BOTH sources with their values (in-app PII display).
    expect(screen.getByText("Lease end date")).toBeInTheDocument();
    expect(screen.getByText(/2026-08-31/)).toBeInTheDocument();
    expect(screen.getByText(/2026-09-30/)).toBeInTheDocument();
    // Agreement label is humanized, not jargon.
    expect(screen.getByText("Two sources disagree")).toBeInTheDocument();

    // Read-only: no resolve form is rendered.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    // production_allowed is surfaced in the demoted diagnostics.
    expect(screen.getByText("Read details")).toBeInTheDocument();
    expect(screen.getByText("false")).toBeInTheDocument();
  });

  it("shows an empty state when no items need a decision", () => {
    render(
      <LiveRenewalReview
        meta={SAMPLE_META}
        view={{ ...SAMPLE_VIEW, groups: [], totalFlags: 0 }}
      />,
    );
    expect(screen.getByText("No open items")).toBeInTheDocument();
  });
});

describe("RenewalDesk live link", () => {
  it("shows the live-review link only when a href is provided", () => {
    const { rerender } = render(<RenewalDesk view={getRenewalDeskView()} />);
    expect(
      screen.queryByRole("link", { name: /View live review/ }),
    ).not.toBeInTheDocument();

    rerender(
      <RenewalDesk liveReviewHref="/lease-renewal/live" view={getRenewalDeskView()} />,
    );
    expect(screen.getByRole("link", { name: /View live review/ })).toHaveAttribute(
      "href",
      "/lease-renewal/live",
    );
  });
});

describe("buildLiveRenewalConfig", () => {
  const FULL_ENV = {
    RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
    RENTVINE_API_KEY: "key",
    RENTVINE_API_SECRET: "secret",
    RENEWAL_SHEET_ID: "sheet-id",
    SHEETS_IMPERSONATE_SA: "reader@pmi-kc-kb-prod.iam.gserviceaccount.com",
    SHEETS_DWD_SUBJECT: "user@pmikcmetro.com",
  };

  it("returns ok with the spreadsheet id when fully configured", () => {
    const config = buildLiveRenewalConfig(FULL_ENV);
    expect(config.ok).toBe(true);
    if (config.ok) expect(config.spreadsheetId).toBe("sheet-id");
  });

  it("reports not_configured when any required value is missing", () => {
    const config = buildLiveRenewalConfig({
      ...FULL_ENV,
      SHEETS_DWD_SUBJECT: undefined,
    });
    expect(config).toEqual({ ok: false, reason: "not_configured" });
  });

  it("reports account_mismatch when the RentVine tenant is not pmikcmetro", () => {
    const config = buildLiveRenewalConfig({
      ...FULL_ENV,
      RENTVINE_API_BASE_URL: "https://someoneelse.rentvine.com/api/manager",
    });
    expect(config).toEqual({ ok: false, reason: "account_mismatch" });
  });
});

describe("categorizeLiveReviewError", () => {
  it("classifies RentVine auth failures and credential messages as auth_error", () => {
    expect(categorizeLiveReviewError(new RentVineAuthError(401))).toBe("auth_error");
    expect(categorizeLiveReviewError(new Error("invalid_grant: token expired"))).toBe(
      "auth_error",
    );
    expect(categorizeLiveReviewError(new Error("403 permission denied"))).toBe(
      "auth_error",
    );
  });

  it("classifies everything else as read_error", () => {
    expect(categorizeLiveReviewError(new Error("socket hang up"))).toBe("read_error");
    expect(categorizeLiveReviewError("network timeout")).toBe("read_error");
  });
});
