// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NoticeTimingBasisLine } from "@/components/lease-renewal/NoticeTimingBasisLine";
import {
  NOTICE_TIMING_BASIS_ADMIN_HREF,
  NOTICE_TIMING_BASIS_NOT_SET,
  noticeTimingBasisLine,
} from "@/lib/lease-renewal/notice-timing-basis-line";
import { NOTICE_TIMING_BASIS_TARGET_ID } from "@/lib/lease-renewal/notice-timing-decision";
import {
  RENEWAL_GOVERNANCE_MATRIX,
  hasRenewalRoleAuthority,
} from "@/lib/lease-renewal/role-action-governance";

// S283 R-S283-5, ARCH-S283-5, BEH-S283-6 and AC-S283-5: the shared notice timing basis is one
// read-only line on a lease for every role; an Admin also sees "Change in Admin", which opens the
// existing Admin entry; selecting it is an Admin action there. The line renders nothing until its
// read answers, after the work, so it is never above the step while the lease loads. Synthetic
// values only; every request here is a GET.

const saved = {
  state: "saved" as const,
  record: {
    id: "active",
    target_kind: "lease_end",
    counting_rule: "calendar_days_target_minus_notice_v1",
    threshold_days: 30,
    reviewed_note: "Synthetic documented decision.",
    version: 2,
    created_at: "2026-11-03T15:00:00.000Z",
    updated_at: "2026-11-03T15:00:00.000Z",
    updated_by_uid: "fixture-admin",
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubRead(payload: unknown) {
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    expect(options?.method ?? "GET").toBe("GET");
    return Response.json(payload);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("R-S283-5 the notice basis line", () => {
  it("BEH-S283-6 reads the saved basis in the settled date format", () => {
    expect(noticeTimingBasisLine(saved)).toBe(
      "Notice timing: counted from the lease end date, in calendar days, 30 days. Applies to every renewal. Set on 11/03/2026.",
    );
    expect(noticeTimingBasisLine({ state: "missing", record: null })).toBe(
      "Notice timing basis: not set. An Admin sets it in Renewal notice rules.",
    );
    expect(noticeTimingBasisLine({ state: "unreadable", record: null })).toMatch(
      /could not be read/,
    );
    expect(
      noticeTimingBasisLine({
        state: "saved",
        record: { ...saved.record, counting_rule: "invented_rule" },
      }),
    ).toMatch(/An Admin reviews it in Renewal notice rules/);
  });

  it("AC-S283-5 an Editor or Approver sees one read-only line and no control", async () => {
    const fetcher = stubRead({
      timingBasis: saved,
      canSelect: false,
      intent: { state: "missing" },
    });
    render(<NoticeTimingBasisLine />);
    const region = screen.getByRole("region", { name: "Notice timing basis" });
    await waitFor(() => expect(region).toHaveTextContent("Set on 11/03/2026."));
    expect(region).toHaveAttribute("data-renewal-focus-context");
    expect(region).toHaveAttribute("id", NOTICE_TIMING_BASIS_TARGET_ID);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link", { name: "Change in Admin" })).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("AC-S283-5 an Admin also sees Change in Admin, which opens the existing Admin entry", async () => {
    stubRead({ timingBasis: saved, canSelect: true, intent: { state: "missing" } });
    render(<NoticeTimingBasisLine />);
    const link = await screen.findByRole("link", { name: "Change in Admin" });
    expect(link).toHaveAttribute("href", NOTICE_TIMING_BASIS_ADMIN_HREF);
    expect(NOTICE_TIMING_BASIS_ADMIN_HREF).toBe(
      "/admin?task=renewal#admin-move-out-timing-basis",
    );
  });

  it("AC-S283-5 with no basis saved the line says so", async () => {
    stubRead({
      timingBasis: { state: "missing", record: null },
      canSelect: false,
      intent: { state: "missing" },
    });
    render(<NoticeTimingBasisLine />);
    expect(await screen.findByText(NOTICE_TIMING_BASIS_NOT_SET)).toBeInTheDocument();
  });

  it("BEH-S283-6 during a slow read the line renders no text at all", async () => {
    let answer: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          }),
      ),
    );
    render(<NoticeTimingBasisLine />);
    const region = screen.getByRole("region", { name: "Notice timing basis" });
    expect(region.textContent).toBe("");
    expect(region).toHaveAttribute("data-notice-basis-line", "loading");
    await act(async () =>
      answer(Response.json({ timingBasis: saved, canSelect: false })),
    );
    await waitFor(() => expect(region).toHaveTextContent("Applies to every renewal."));
  });
});

describe("ARCH-S283-5 the basis has one writer, the Admin entry", () => {
  it("ARCH-S283-5 selecting the basis is an Admin capability; Editors and Approvers read it", () => {
    expect(RENEWAL_GOVERNANCE_MATRIX.select_notice_timing_basis.roleCapability).toBe(
      "manageAdmin",
    );
    expect(hasRenewalRoleAuthority("select_notice_timing_basis", "Admin")).toBe(true);
    expect(hasRenewalRoleAuthority("select_notice_timing_basis", "Approver")).toBe(false);
    expect(hasRenewalRoleAuthority("select_notice_timing_basis", "Editor")).toBe(false);
  });

  it("BEH-S283-6 the lease renders the read-only line after the work and no selector", () => {
    const source = readFileSync(
      join(process.cwd(), "components/lease-renewal/RenewalWorkspace.tsx"),
      "utf8",
    );
    expect(source).not.toContain("<NoticeTimingBasisSelection");
    const line = source.indexOf("<NoticeTimingBasisLine");
    expect(line).toBeGreaterThan(0);
    // The line comes after the step sections (the dashboard navigation that holds every step).
    expect(line).toBeGreaterThan(source.lastIndexOf("</RenewalDashboardNavigation>"));
    expect(line).toBeLessThan(source.lastIndexOf("</RenewalFocusViewSlot>"));
  });
});
