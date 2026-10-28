import { describe, expect, it } from "vitest";

import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import {
  deskLeaseWorkStatusInput,
  leaseWorkStatusLines,
  projectLeaseWorkStatus,
  staffRecordLatestAtIso,
  type LeaseWorkStatusFollowUp,
} from "@/lib/lease-renewal/lease-work-status";
import { actionFixture, manualFixture } from "@/tests/helpers/renewal-action-fixtures";

// S232 R-S232-4 (ARCH-S232-2, BEH-S232-3): one status, waiting-on party and evidence per lease from
// the staff record, compared with the linked Gmail thread's waiting marker; a disagreement reads
// "Needs a check" with both facts. Synthetic records only.

const READ_AT = "2026-09-30T17:00:00.000Z";

function thread(
  waiting: "owner" | "tenant" | "team" | "unresolved_source" | "none" | "unknown",
): LeaseWorkStatusFollowUp {
  const source = {
    kind: "gmail_thread" as const,
    linkId: "link-1",
    threadId: "thread-1",
    messageId: "message-1",
    purpose: "renewal_owner" as const,
  };
  return {
    waiting:
      waiting === "none"
        ? { state: "not_waiting", party: null, source }
        : waiting === "unknown"
          ? { state: "needs_verification", party: null, source: null }
          : { state: "verified", party: waiting, source },
    lastContact: { state: "verified", atIso: "2026-09-29T15:00:00.000Z", source },
  };
}

/** The process-step fallbacks the follow-up projection uses when no thread marker is known. */
const PROCESS_FALLBACKS: readonly LeaseWorkStatusFollowUp[] = (
  [
    ["document_coordinator", "document-packet"],
    ["unresolved_source", "verify-renewal"],
  ] as const
).map(([party, step]) => ({
  waiting: {
    state: "verified",
    party,
    source: { kind: "renewal_process", ref: `renewal-process:v1:${step}` },
  },
  lastContact: { state: "needs_verification", atIso: null, source: null },
}));

/** The desk row the live desk builds for this staff record, with its real guidance. */
function deskRow(
  manual: NonNullable<Parameters<typeof actionFixture>[0]>["manual"],
  followUp: LeaseWorkStatusFollowUp | null = null,
): Pick<
  DeskLeaseRow,
  "guidance" | "manualProgress" | "staffRecordedAtIso" | "staffRecordUnavailable"
> & { followUp: LeaseWorkStatusFollowUp | null } {
  const { workspace } = actionFixture({ manual });
  return { ...workspace.summary, guidance: workspace.guidance, followUp };
}

function statusOf(row: ReturnType<typeof deskRow>) {
  const status = projectLeaseWorkStatus(deskLeaseWorkStatusInput(row, READ_AT));
  return { status, lines: leaseWorkStatusLines(status) };
}

describe("S232 one status, waiting-on and evidence (R-S232-4)", () => {
  it("guides a lease with nothing recorded to the first staff action, never a phase label", () => {
    const row = deskRow(null);
    const { status, lines } = statusOf(row);
    expect(row.guidance.overallStatus).toBe("ready");
    expect(row.guidance.action.kind).toBe("act");
    expect("label" in row.guidance.action && row.guidance.action.label).not.toBe(
      "Owner decision",
    );
    expect(status).toMatchObject({ status: "ready", label: "Ready", check: null });
    expect(lines).toEqual({
      waiting: "Waiting on: the PMI KC team",
      check: null,
      evidence:
        "From the RentVine read at 09/30/2026, 12:00 PM CDT; nothing recorded by staff yet",
    });
  });

  it("names the owner or tenant only while they have the move, citing the staff record's time", () => {
    const awaitingOwner = deskRow(
      manualFixture({ owner: "no_response", done: ["owner_outreach"] }),
      thread("owner"),
    );
    expect(awaitingOwner.guidance.overallStatus).toBe("waiting");
    expect(statusOf(awaitingOwner).lines).toEqual({
      waiting: "Waiting on: the owner",
      check: null,
      evidence: "From the staff record, saved 09/30/2026, 7:00 AM CDT",
    });

    // A requested revision and a tenant counter hand the move back to the PMI KC team.
    for (const manual of [
      manualFixture({ owner: "revision_requested", done: ["owner_outreach"] }),
      manualFixture({
        owner: "approved_terms",
        tenant: "counter_change_requested",
        done: ["owner_outreach", "tenant_offer"],
      }),
    ]) {
      const row = deskRow(manual, thread("team"));
      expect(row.guidance.overallStatus).toBe("ready");
      expect(row.guidance.action.kind).toBe("act");
      expect(statusOf(row).status).toMatchObject({
        status: "ready",
        waitingOn: "the PMI KC team",
        check: null,
      });
    }

    const tenant = deskRow(
      manualFixture({
        owner: "approved_terms",
        tenant: "awaiting_response",
        done: ["owner_outreach", "tenant_offer"],
      }),
      thread("tenant"),
    );
    expect(statusOf(tenant).status).toMatchObject({
      status: "waiting",
      waitingOn: "the tenant",
      check: null,
    });

    const complete = deskRow(
      manualFixture({ owner: "approved_terms", completion: true }),
      thread("none"),
    );
    expect(statusOf(complete)).toMatchObject({
      status: {
        status: "complete",
        label: "Completed: recorded by staff",
        waitingOn: null,
      },
      lines: { waiting: null, check: null },
    });
  });

  it("reads Needs a check with both facts when the staff record and the linked thread disagree", () => {
    const owner = manualFixture({ owner: "no_response", done: ["owner_outreach"] });
    expect(statusOf(deskRow(owner, thread("tenant")))).toMatchObject({
      status: { status: "needs_check", label: "Needs a check", waitingOn: null },
      lines: {
        waiting: null,
        check:
          "The staff record says waiting on the owner; the linked Gmail thread says waiting on the tenant.",
        evidence: "From the staff record, saved 09/30/2026, 7:00 AM CDT",
      },
    });
    expect(statusOf(deskRow(owner, thread("none"))).lines.check).toBe(
      "The staff record says waiting on the owner; the linked Gmail thread says not waiting on anyone.",
    );
    expect(statusOf(deskRow(owner, thread("unresolved_source"))).lines.check).toBe(
      "The staff record says waiting on the owner; the linked Gmail thread says waiting on someone outside PMI KC.",
    );
    // Nothing recorded while the thread waits on the owner: the outreach is not on the record.
    expect(statusOf(deskRow(null, thread("owner"))).lines.check).toBe(
      "The staff record has no work recorded yet; the linked Gmail thread says waiting on the owner.",
    );
    const complete = manualFixture({ owner: "approved_terms", completion: true });
    expect(statusOf(deskRow(complete, thread("tenant"))).lines.check).toBe(
      "The staff record says complete; the linked Gmail thread says waiting on the tenant.",
    );
  });

  it("compares only a known thread marker, never the process-step fallback", () => {
    const owner = manualFixture({ owner: "no_response", done: ["owner_outreach"] });
    for (const followUp of [thread("unknown"), ...PROCESS_FALLBACKS, null])
      expect(statusOf(deskRow(owner, followUp)).status).toMatchObject({
        status: "waiting",
        waitingOn: "the owner",
        check: null,
      });
  });

  it("fails closed when the staff record could not be read", () => {
    const row = deskRow("unreadable", thread("owner"));
    expect(row.guidance.overallStatus).toBe("needs_verification");
    expect("label" in row.guidance.action && row.guidance.action.label).toBe(
      "Saved renewal progress could not be read. Refresh to see it.",
    );
    expect(statusOf(row)).toMatchObject({
      status: { status: "needs_verification", waitingOn: null, check: null },
      lines: {
        evidence:
          "The staff record could not be read; refresh before relying on this status.",
      },
    });
  });

  it("cites the newest time on the staff record and leaves an unknown read time out", () => {
    const state = manualFixture({ owner: "no_response", done: ["owner_outreach"] });
    state.activities.owner_outreach = {
      ...state.activities.owner_outreach!,
      recordedAt: "2026-10-02T14:30:00.000Z",
    };
    expect(staffRecordLatestAtIso(state)).toBe("2026-10-02T14:30:00.000Z");
    expect(staffRecordLatestAtIso(null)).toBeNull();
    const status = projectLeaseWorkStatus(deskLeaseWorkStatusInput(deskRow(null), null));
    expect(leaseWorkStatusLines(status).evidence).toBe(
      "From the RentVine read; nothing recorded by staff yet",
    );
  });
});
