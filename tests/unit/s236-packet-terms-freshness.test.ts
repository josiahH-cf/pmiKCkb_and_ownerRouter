import { describe, expect, it } from "vitest";

import {
  APPROVED_TERMS_SOURCE_SYSTEM,
  approvedTermsReference,
  currentOwnerApproval,
  packetWorkingTermsFreshness,
} from "@/lib/lease-documents/owner-approval-binding";
import {
  OLDER_TERMS_NOTE,
  projectReturnedState,
} from "@/lib/lease-documents/returned-state";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import {
  emptyRenewalWorkspace,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

// PR #161 review (discussion_r4402147961): a packet's signatures count only while its documents
// carry the current Working renewal terms. The packet names the exact term field revisions its
// approval covered; a packet without that reference is judged by when the terms were saved. Other
// Working fields, notes, same-value saves and owner-response age never change the answer.

const CYCLE = "11111111-1111-4111-8111-111111111111";
const entry = (value: number | string, revision: number, recordedAt: string) => ({
  value,
  revision,
  eventId: `event-${revision}`,
  recordedAt,
  recordedByUid: "editor-1",
  recordedByLabel: "editor1@pmikcmetro.com",
  origin: "staff_entry" as const,
});
function working(
  fields: Record<string, ReturnType<typeof entry>> = {},
): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: "4821",
    revision: 3,
    fields: {
      terms_rent: entry(1750, 1, "2026-10-20T15:00:00.000Z"),
      terms_effective_date: entry("2026-12-01", 1, "2026-10-20T15:01:00.000Z"),
      terms_end_date: entry("2027-11-30", 1, "2026-10-20T15:02:00.000Z"),
      ...fields,
    },
  };
}
const approval = (revisions = { rent: 1, effectiveDate: 1, endDate: 1 }) => ({
  system: APPROVED_TERMS_SOURCE_SYSTEM,
  reference: approvedTermsReference(CYCLE, revisions),
  retrievedAt: "2026-10-21T15:00:00.000Z",
  version: "1",
});
const PACKET_CREATED = "2026-10-22T15:00:00.000Z";

describe("PR #161 review: packet Working terms freshness", () => {
  it("is current while the packet's approval names the saved term revisions", () => {
    expect(
      packetWorkingTermsFreshness({
        cycleId: CYCLE,
        sourceVersions: [approval()],
        createdAt: PACKET_CREATED,
        working: working(),
      }),
    ).toEqual({ current: true, changedAt: "2026-10-20T15:02:00.000Z" });
  });

  it.each([
    ["terms_rent", entry(1800, 2, "2026-10-25T15:00:00.000Z")],
    ["terms_effective_date", entry("2026-12-15", 2, "2026-10-25T15:00:00.000Z")],
    ["terms_end_date", entry("2027-12-14", 2, "2026-10-25T15:00:00.000Z")],
    // Saving a term back to its earlier value is still a later revision, as for the approval.
    ["terms_rent", entry(1750, 3, "2026-10-25T15:00:00.000Z")],
  ])("is older once %s is saved again", (field, saved) => {
    expect(
      packetWorkingTermsFreshness({
        cycleId: CYCLE,
        sourceVersions: [approval()],
        createdAt: PACKET_CREATED,
        working: working({ [field]: saved }),
      }),
    ).toEqual({ current: false, changedAt: "2026-10-25T15:00:00.000Z" });
  });

  it("ignores the current-base rent, the Sheet row, Sheet cells and their notes", () => {
    const unrelated = working({
      current_rent: entry(1600, 4, "2026-10-26T15:00:00.000Z"),
      sheet_row: { ...entry("row", 2, "2026-10-26T15:00:00.000Z") },
      "sheet_cell.renewal_letter_sent": {
        ...entry("Yes", 2, "2026-10-26T15:00:00.000Z"),
      },
    });
    for (const sourceVersions of [[approval()], []])
      expect(
        packetWorkingTermsFreshness({
          cycleId: CYCLE,
          sourceVersions,
          createdAt: PACKET_CREATED,
          working: unrelated,
        }).current,
      ).toBe(true);
  });

  it("is never current for another cycle's approval or two different approvals", () => {
    const other = {
      ...approval(),
      reference: approvedTermsReference("22222222-2222-4222-8222-222222222222", {
        rent: 1,
        effectiveDate: 1,
        endDate: 1,
      }),
    };
    for (const sourceVersions of [
      [other],
      [approval(), approval({ rent: 2, effectiveDate: 1, endDate: 1 })],
    ])
      expect(
        packetWorkingTermsFreshness({
          cycleId: CYCLE,
          sourceVersions,
          createdAt: PACKET_CREATED,
          working: working(),
        }).current,
      ).toBe(false);
  });

  it("judges a packet without an approval reference by when the terms were saved", () => {
    const judged = (createdAt: string, record: RenewalWorkingRecord | null) =>
      packetWorkingTermsFreshness({
        cycleId: CYCLE,
        sourceVersions: [],
        createdAt,
        working: record,
      });
    expect(judged(PACKET_CREATED, working()).current).toBe(true);
    expect(judged(PACKET_CREATED, null)).toEqual({ current: true, changedAt: null });
    expect(
      judged(
        PACKET_CREATED,
        working({ terms_end_date: entry("2027-12-14", 2, "2026-10-23T15:00:00.000Z") }),
      ),
    ).toEqual({ current: false, changedAt: "2026-10-23T15:00:00.000Z" });
  });

  it("fails closed on an unreadable saved time", () => {
    expect(
      packetWorkingTermsFreshness({
        cycleId: CYCLE,
        sourceVersions: [approval()],
        createdAt: PACKET_CREATED,
        working: working({ terms_rent: entry(1750, 1, "not-a-time") }),
      }),
    ).toEqual({ current: false, changedAt: null });
  });

  it("reads the same reference the approval-bound packet facts carry", () => {
    const record = working();
    const workspace: RenewalWorkspaceState = {
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
          economicsHash: "e".repeat(64),
          chargePolicyVersion: null,
        },
      },
    };
    const facts = currentOwnerApproval({
      workspace,
      working: record,
      economicsHash: "e".repeat(64),
    }).facts;
    expect(facts.map((fact) => fact.source)).toEqual(
      Array(3).fill(expect.objectContaining(approval())),
    );
    expect(
      packetWorkingTermsFreshness({
        cycleId: CYCLE,
        sourceVersions: [facts[0].source],
        createdAt: PACKET_CREATED,
        working: record,
      }).current,
    ).toBe(true);
  });
});

describe("PR #161 review: signatures on a packet with older Working terms", () => {
  const SAM = "00000000-0000-4000-8000-000000000001";
  const signed = (observedAt: string) => ({
    leaseId: "4821",
    cycleId: CYCLE,
    snapshotId: "packet_a",
    kind: "renewal_extension" as const,
    documentContentHash: "b".repeat(64),
    revision: 2,
    sentForSignature: { at: "2026-10-23T15:00:00.000Z", how: "Dotloop" },
    signers: [
      {
        personId: SAM,
        signerRole: "tenant" as const,
        status: "signed" as const,
        observedAt,
        evidence: {
          kind: "dotloop_observed" as const,
          documentName: "Renewal extension",
          viewedAt: observedAt,
        },
        recordedAt: observedAt,
        recordedByUid: "editor-1",
      },
    ],
  });
  const project = (packetTermsCurrent: boolean, observedAt: string) =>
    projectReturnedState({
      leaseId: "4821",
      cycleId: CYCLE,
      snapshotId: "packet_a",
      documents: [
        {
          kind: "renewal_extension",
          label: "the renewal extension",
          contentHash: "b".repeat(64),
          prepared: true,
          uploaded: false,
          signers: [
            {
              signerRole: "tenant",
              participantKind: "tenant",
              required: true,
              location: "Tenant signature",
            },
          ],
        },
      ],
      people: [
        {
          personId: SAM,
          kind: "person",
          fullName: "Sam Example",
          email: null,
          emailBasis: null,
          contactRef: null,
          roles: [{ signerRole: "tenant", order: 1, dotloopRole: "TENANT" }],
        },
      ],
      records: [signed(observedAt)] as never,
      termsChangedAt: "2026-10-25T15:00:00.000Z",
      packetTermsCurrent,
    });

  it("counts a current packet's signature and keeps the older packet's as history only", () => {
    expect(project(true, "2026-10-26T15:00:00.000Z")).toMatchObject({
      overall: "Fully executed",
      signaturesComplete: true,
    });
    // A signature observed after the terms changed still does not cover an older packet.
    const older = project(false, "2026-10-26T15:00:00.000Z");
    expect(older).toMatchObject({
      overall: "Sent for signature",
      signaturesComplete: false,
    });
    expect(older.documents[0].notes).toContain(OLDER_TERMS_NOTE);
    expect(older.documents[0].stillMustSign).toEqual([
      {
        name: "Sam Example",
        capacity: "tenant",
        nextAction:
          "Prepare the packet again for the current Working terms, then ask Sam Example to sign the renewal extension",
      },
    ]);
  });
});
