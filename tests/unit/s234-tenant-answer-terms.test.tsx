// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fixtureWorkingRecord } from "../helpers/rent-charge-fixtures";
import {
  RenewalManualProvider,
  RenewalManualSection,
} from "@/components/lease-renewal/RenewalManualWorkspace";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import { tenantAnswerCoversCurrentTerms } from "@/lib/lease-renewal/tenant-answer-terms";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

// S234 R-S234-5 (BEH-S234-2): a tenant answer answers the Working terms it was recorded against.
// Saving a Working term after it, even to the same value, makes it an answer to earlier terms; it
// never stands in for the owner's answer. Synthetic records only.

vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
afterEach(cleanup);

const CYCLE = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const RECORDED_AT = "2026-09-10T12:00:00.000Z";
function answered(
  revisions: { rent: number; effectiveDate: number; endDate: number } | null,
) {
  return planRenewalWorkspaceAction(
    emptyRenewalWorkspace("4821", CYCLE, {
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "RentVine lease end",
    }),
    { kind: "tenant_response", outcome: "accepted", source: "Tenant call" },
    {
      actorUid: "operator",
      recordedAt: RECORDED_AT,
      eventId: "tenant",
      workingTermRevisions: revisions,
    },
  );
}
const terms = (rentRevision = 1) =>
  fixtureWorkingRecord({
    terms_rent: { value: 1750, revision: rentRevision },
    terms_effective_date: { value: "2027-01-01", revision: 1 },
    terms_end_date: { value: "2027-12-31", revision: 1 },
  });
const savedAt = (record: ReturnType<typeof terms>, iso: string) => ({
  ...record,
  fields: Object.fromEntries(
    Object.entries(record.fields).map(([field, entry]) => [
      field,
      { ...entry, recordedAt: iso },
    ]),
  ),
});

describe("S234 tenant answer against the Working terms (R-S234-5)", () => {
  it("keeps the Working term revisions the answer was recorded against", () => {
    const state = answered({ rent: 1, effectiveDate: 1, endDate: 1 });
    expect(state.tenantResponse).toMatchObject({
      outcome: "accepted",
      workingTermRevisions: { rent: 1, effectiveDate: 1, endDate: 1 },
    });
    expect(tenantAnswerCoversCurrentTerms(state, terms())).toBe(true);
    // A rent save after the answer, even back to the same value, is a later term.
    expect(tenantAnswerCoversCurrentTerms(state, terms(2))).toBe(false);
    // A staff terms change also leaves it answering earlier terms.
    expect(
      tenantAnswerCoversCurrentTerms(
        { ...state, termsRevision: state.termsRevision + 1 },
        terms(),
      ),
    ).toBe(false);
  });

  it("reads an answer recorded before revisions were kept by when the terms were saved", () => {
    const legacy = answered(null);
    expect(legacy.tenantResponse).not.toHaveProperty("workingTermRevisions");
    expect(
      tenantAnswerCoversCurrentTerms(
        legacy,
        savedAt(terms(), "2026-09-09T12:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      tenantAnswerCoversCurrentTerms(
        legacy,
        savedAt(terms(), "2026-09-11T12:00:00.000Z"),
      ),
    ).toBe(false);
    expect(tenantAnswerCoversCurrentTerms(legacy, savedAt(terms(), "not a time"))).toBe(
      false,
    );
    expect(tenantAnswerCoversCurrentTerms(legacy, null)).toBe(true);
  });

  it("says on screen when the tenant answered earlier Working terms", () => {
    const state: RenewalWorkspaceState = answered({
      rent: 1,
      effectiveDate: 1,
      endDate: 1,
    });
    const mount = (record: ReturnType<typeof terms>) =>
      render(
        <RenewalWorkingRecordProvider canEdit initialRecord={record} leaseId="4821">
          <RenewalManualProvider initialState={state} leaseId="4821">
            <RenewalManualSection section="tenant" />
          </RenewalManualProvider>
        </RenewalWorkingRecordProvider>,
      );
    const current = mount(terms());
    expect(screen.queryByText(/Recorded before the terms changed/)).toBeNull();
    current.unmount();
    mount(terms(2));
    expect(
      screen.getByText(
        /Recorded before the terms changed; it does not answer the current terms\./,
      ),
    ).toBeInTheDocument();
  });
});
