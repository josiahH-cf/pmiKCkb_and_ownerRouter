import { describe, expect, it } from "vitest";

import { projectSourceUpdateTermsBasis } from "@/lib/lease-renewal/source-update-terms-basis";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import {
  emptyRenewalWorkspace,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

// S237 R-S237-1: the terms basis names the Working terms revision and when it was saved, whether
// the recorded approval covers exactly those terms (owner-approval-binding), and the executed
// documents (S236). Informational only. Synthetic terms and records.

const CYCLE = "11111111-1111-4111-8111-111111111111";
const ECON = "e".repeat(64);
const entry = (value: number | string, revision: number, recordedAt: string) => ({
  value,
  revision,
  eventId: `event-${revision}`,
  recordedAt,
  recordedByUid: "editor-1",
  recordedByLabel: "editor1@pmikcmetro.com",
  origin: "staff_entry" as const,
});
const working = (rentRevision = 1): RenewalWorkingRecord => ({
  schemaVersion: "renewal-working-record/v1",
  leaseId: "4821",
  revision: 3,
  fields: {
    terms_rent: entry(1750, rentRevision, "2026-10-20T15:00:00.000Z"),
    terms_effective_date: entry("2026-12-01", 1, "2026-10-20T15:01:00.000Z"),
    terms_end_date: entry("2027-11-30", 1, "2026-10-20T15:02:00.000Z"),
  },
});
const approved = (): RenewalWorkspaceState => ({
  ...emptyRenewalWorkspace("4821", CYCLE, {
    kind: "lease_end",
    dateIso: "2026-11-30",
    source: "RentVine lease end",
  }),
  termsRevision: 1,
  ownerResponse: {
    eventId: "approval",
    actorUid: "editor-1",
    recordedAt: "2026-10-21T15:00:00.000Z",
    source: "Staff record",
    termsRevision: 1,
    outcome: "approved_terms",
    approvedWorkingTerms: {
      rent: 1750,
      effectiveDate: "2026-12-01",
      endDate: "2027-11-30",
      fieldRevisions: { rent: 1, effectiveDate: 1, endDate: 1 },
      economicsHash: ECON,
      chargePolicyVersion: null,
    },
  },
});
const returned = (overrides = {}) => ({
  unavailable: null,
  signaturesComplete: false,
  overall: "Partially signed",
  packetTermsCurrent: true,
  ...overrides,
});
const time = (iso: string) => iso;

describe("S237 R-S237-1 terms basis", () => {
  it("names the revision, its save time, covered approval and the documents state", () => {
    expect(
      projectSourceUpdateTermsBasis({
        working: working(),
        workspace: approved(),
        economicsHash: ECON,
        returned: returned({ signaturesComplete: true, overall: "Fully executed" }),
        formatTime: time,
      }),
    ).toEqual({
      terms: "Working renewal terms revision 1, saved 2026-10-20T15:02:00.000Z",
      approval: "Owner approval covers these terms and charges",
      documents:
        "Executed documents: Fully executed by staff record, not provider-verified",
    });
  });

  it("says when the approval no longer covers the terms or the charges, or none exists", () => {
    const basis = (over: Partial<Parameters<typeof projectSourceUpdateTermsBasis>[0]>) =>
      projectSourceUpdateTermsBasis({
        working: working(),
        workspace: approved(),
        economicsHash: ECON,
        returned: returned(),
        formatTime: time,
        ...over,
      }).approval;
    expect(basis({ working: working(2) })).toBe(
      "Owner approval no longer covers these terms: the Working terms changed after it was recorded",
    );
    expect(basis({ economicsHash: "f".repeat(64) })).toBe(
      "Owner approval no longer covers these terms: the calculated charges changed after it was recorded",
    );
    expect(basis({ workspace: null })).toBe("No recorded owner approval");
    expect(basis({ economicsHash: null })).toBe(
      "Owner approval coverage could not be checked: the calculated charges could not be read",
    );
  });

  it("reads documents as not recorded, earlier terms or their state, and no terms as none", () => {
    const docs = (
      value: Parameters<typeof projectSourceUpdateTermsBasis>[0]["returned"],
    ) =>
      projectSourceUpdateTermsBasis({
        working: null,
        workspace: null,
        economicsHash: ECON,
        returned: value,
        formatTime: time,
      });
    expect(docs(null)).toMatchObject({
      terms: "No Working renewal terms saved",
      documents: "Executed documents: Not recorded",
    });
    expect(
      docs(returned({ unavailable: "No current app packet exists" })).documents,
    ).toBe("Executed documents: Not recorded");
    expect(docs(returned({ packetTermsCurrent: false })).documents).toBe(
      "Executed documents: signatures are for earlier Working terms",
    );
    expect(docs(returned()).documents).toBe("Executed documents: Partially signed");
  });
});
