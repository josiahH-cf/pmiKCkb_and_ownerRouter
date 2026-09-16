import { describe, expect, it } from "vitest";

import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "@/lib/lease-renewal/headers";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import {
  SHEET_AUDIENCE_EMAIL_FIELDS,
  SHEET_FIELD_LABELS,
  parseSheetFieldIntent,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";
import {
  SHEET_SUPPORTED_FIELDS,
  buildSheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  audienceEmailRoster,
  effectForAudienceEmailIntent,
  formatAudienceEmails,
} from "@/lib/lease-renewal/sheet-writeback/audience-emails";
import { hashSheetHeader } from "@/lib/lease-renewal/sheet-writeback/execution-service";
import {
  SheetWorkspaceResolutionError,
  assertProposalMatchesFreshLeaseContext,
  type FreshOperatingSheetLeaseContext,
} from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";

const BASE_HEADER = SAMPLE_RENEWAL_TABLES[0][0] as readonly string[];
const HEADER_WITH_EMAILS = [...BASE_HEADER, "Owner emails", "Tenant emails"];
const OWNER_COLUMN = HEADER_WITH_EMAILS.length - 2;
const TENANT_COLUMN = HEADER_WITH_EMAILS.length - 1;
const READ_AT = "2026-09-16T17:00:00.000Z";

function columnsFor(header: readonly string[]): Map<string, number> {
  const resolution = resolveHeaders([header as string[]], RENEWAL_TAB_SCHEMAS.Renewals);
  return new Map(Object.entries(resolution.resolvedFields));
}

function context(input: {
  header?: readonly string[];
  ownerCell?: string;
  tenantCell?: string;
  rosters?: FreshOperatingSheetLeaseContext["rosters"];
}): FreshOperatingSheetLeaseContext {
  const header = [...(input.header ?? HEADER_WITH_EMAILS)];
  const columns = columnsFor(header);
  const fieldValues = Object.fromEntries([...columns.keys()].map((key) => [key, ""]));
  if (columns.has("owner_emails")) fieldValues.owner_emails = input.ownerCell ?? "";
  if (columns.has("tenant_emails")) fieldValues.tenant_emails = input.tenantCell ?? "";
  return {
    leaseId: "4821",
    propertyId: "84",
    tenantName: "Jordan Maple",
    sourceReadAtIso: READ_AT,
    header,
    columns,
    tenantColumnIndex: columns.get("tenant_name") ?? 2,
    association: { kind: "exact_link", rowNumber: 2 },
    rosters: input.rosters ?? {
      owner: { status: "ready", to: "a@example.test", cc: ["b@example.test"] },
      tenant: { status: "ready", to: "t1@example.test", cc: [] },
    },
    row: {
      rowNumber: 2,
      rowKey: null,
      anchorTenantName: "Jordan Maple",
      currentRentValue: "$1,250",
      fieldValues,
      formulaFields: [],
      currentRentSourceTriggerKey: null,
      currentRentCandidateFingerprint: null,
    },
  };
}

// R116.3 (Q3A accepted): two explicit Sheet meanings, Owner emails and Tenant emails, each holding
// the complete current source-backed address set for its audience, prepared only from the lease
// roster through the existing narrow exact-confirmed field-update path. Missing columns refuse
// with the exact headers to add; the app never creates a column.
describe("S116 audience email fields (AC-S116-3)", () => {
  it("resolves both semantic headers and lists them as supported fields", () => {
    const resolution = resolveHeaders(
      [[...HEADER_WITH_EMAILS]],
      RENEWAL_TAB_SCHEMAS.Renewals,
    );
    expect(resolution.resolvedFields.owner_emails).toBe(OWNER_COLUMN);
    expect(resolution.resolvedFields.tenant_emails).toBe(TENANT_COLUMN);
    expect(SHEET_SUPPORTED_FIELDS).toContain("owner_emails");
    expect(SHEET_SUPPORTED_FIELDS).toContain("tenant_emails");
    expect(SHEET_AUDIENCE_EMAIL_FIELDS).toEqual({
      owner_emails: { label: "Owner emails", channel: "owner" },
      tenant_emails: { label: "Tenant emails", channel: "tenant" },
    });
  });

  it("keeps the email fields out of the free-typed editor allowlist", () => {
    expect(Object.keys(SHEET_FIELD_LABELS)).not.toContain("owner_emails");
    expect(Object.keys(SHEET_FIELD_LABELS)).not.toContain("tenant_emails");
    expect(() =>
      parseSheetFieldIntent({
        field: "owner_emails",
        value: "x@example.test",
        source: "typed",
      }),
    ).toThrow();
  });

  it("formats the complete address set deterministically without truncation", () => {
    expect(
      formatAudienceEmails({
        status: "ready",
        to: "a@example.test",
        cc: ["b@example.test"],
      }),
    ).toBe("a@example.test, b@example.test");
    const many = Array.from({ length: 12 }, (_, i) => `p${i}@example.test`);
    const formatted = formatAudienceEmails({
      status: "ready",
      to: many[0],
      cc: many.slice(1),
    });
    expect(formatted.split(", ")).toHaveLength(12);
    expect(formatted.length).toBeGreaterThan(150);
  });

  it("refuses with the two exact headers and the tab when the column is absent", () => {
    const missing = context({ header: BASE_HEADER });
    try {
      effectForAudienceEmailIntent(missing, "owner");
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(SheetWorkspaceResolutionError);
      expect((error as SheetWorkspaceResolutionError).code).toBe("email_column_missing");
    }
    const roster = audienceEmailRoster(missing, "owner");
    expect(roster.column).toBeNull();
    expect(roster.setup).toMatch(/Owner emails/);
    expect(roster.setup).toMatch(/Tenant emails/);
    expect(roster.setup).toMatch(/Lease Renewal/);
    expect(roster.setup).toMatch(/does not create/i);
  });

  it("refuses when the roster is incomplete or collides across channels", () => {
    const blocked = context({
      rosters: {
        owner: { status: "ready", to: "a@example.test", cc: [] },
        tenant: {
          status: "blocked",
          reasons: [
            "Tenant 2 has no email on file; correct the lease contact in RentVine.",
          ],
        },
      },
    });
    expect(() => effectForAudienceEmailIntent(blocked, "tenant")).toThrow(
      /recipient_roster_blocked/,
    );
    expect(effectForAudienceEmailIntent(blocked, "owner").afterValue).toBe(
      "a@example.test",
    );
  });

  it("prepares the exact cell update from the roster and binds it to that roster read", () => {
    const current = context({ ownerCell: "old@example.test" });
    const effect = effectForAudienceEmailIntent(current, "owner");
    expect(effect).toMatchObject({
      kind: "field_update",
      field: "owner_emails",
      rowNumber: 2,
      anchorTenantName: "Jordan Maple",
      expectedValue: "old@example.test",
      afterValue: "a@example.test, b@example.test",
      source: `rentvine:lease:4821:owner roster read ${READ_AT}`,
      audienceIntent: { audience: "owner", field: "owner_emails" },
    });
    const proposal = buildSheetWritebackProposal({
      generationId: "proposal-12345678",
      spreadsheetId: "sheet-live-1",
      tabTitle: "Lease Renewal",
      headerHash: hashSheetHeader(current.header, current.columns),
      headerWidth: current.header.length,
      tenantColumnIndex: current.tenantColumnIndex,
      scope: { kind: "lease_workspace", leaseId: "4821", propertyId: "84" },
      actorUid: "editor-1",
      actorEmail: "editor@pmikcmetro.com",
      actorRole: "Editor",
      sourceReadAtIso: READ_AT,
      evidenceRef: "workspace:4821:fresh-live-join",
      effects: [effect],
      nowMs: Date.parse(READ_AT),
    });
    expect(proposal.effects).toHaveLength(1);
    // The same roster on a fresh read keeps the proposal current; roster drift invalidates it.
    expect(() =>
      assertProposalMatchesFreshLeaseContext(proposal, current, null),
    ).not.toThrow();
    const drifted = context({
      ownerCell: "old@example.test",
      rosters: {
        owner: { status: "ready", to: "a@example.test", cc: ["c@example.test"] },
        tenant: { status: "ready", to: "t1@example.test", cc: [] },
      },
    });
    expect(() => assertProposalMatchesFreshLeaseContext(proposal, drifted, null)).toThrow(
      /proposal_stale/,
    );
  });

  it("rejects a forged audience intent whose field or audience disagree", () => {
    const current = context({ ownerCell: "old@example.test" });
    const effect = effectForAudienceEmailIntent(current, "owner");
    const base = {
      generationId: "proposal-12345678",
      spreadsheetId: "sheet-live-1",
      tabTitle: "Lease Renewal",
      headerHash: hashSheetHeader(current.header, current.columns),
      headerWidth: current.header.length,
      tenantColumnIndex: current.tenantColumnIndex,
      scope: { kind: "lease_workspace" as const, leaseId: "4821", propertyId: "84" },
      actorUid: "editor-1",
      actorEmail: "editor@pmikcmetro.com",
      actorRole: "Editor" as const,
      sourceReadAtIso: READ_AT,
      evidenceRef: "workspace:4821:fresh-live-join",
      nowMs: Date.parse(READ_AT),
    };
    expect(() =>
      buildSheetWritebackProposal({
        ...base,
        effects: [{ ...effect, field: "tenant_emails" }],
      }),
    ).toThrow();
    expect(() =>
      buildSheetWritebackProposal({
        ...base,
        effects: [
          {
            ...effect,
            audienceIntent: { ...effect.audienceIntent!, audience: "tenant" },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      buildSheetWritebackProposal({
        ...base,
        effects: [{ ...effect, afterValue: "someone.else@example.test" }],
      }),
    ).toThrow();
  });

  it("reports an already-current cell instead of preparing a no-change update", () => {
    const current = context({ ownerCell: "a@example.test, b@example.test" });
    expect(audienceEmailRoster(current, "owner")).toMatchObject({
      column: OWNER_COLUMN,
      current: "a@example.test, b@example.test",
      proposed: "a@example.test, b@example.test",
      state: "current",
    });
    expect(() => effectForAudienceEmailIntent(current, "owner")).toThrow(/no_change/);
  });
});
