import { describe, expect, it } from "vitest";

import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import { leaseWaitingFor, type LeaseWaiting } from "@/lib/lease-renewal/lease-waiting";
import {
  deskLeaseWorkStatusInput,
  leaseWorkStatusLines,
  projectLeaseWorkStatus,
  staffRecordLatestAtIso,
} from "@/lib/lease-renewal/lease-work-status";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";
import { actionFixture, manualFixture } from "@/tests/helpers/renewal-action-fixtures";
import { evidenceInput, message } from "@/tests/helpers/outreach-evidence-fixtures";

// S232 R-S232-4 (ARCH-S232-2, BEH-S232-3): one status, waiting-on party and evidence per lease from
// the staff record. S279 (rewritten on purpose, R-S279-2 / R-S279-3): the staff record is compared
// with the current message's own thread in the lease's evidence, never one viewer's linked Gmail
// thread; a real disagreement still reads "Needs a check" with both facts, now with the fix.
// Synthetic records only.

const READ_AT = "2026-09-30T17:00:00.000Z";
/** 10:00 Central on September 28 and September 29, 2026, before the staff record's save. */
const SENT = Date.parse("2026-09-28T15:00:00.000Z");
const REPLY = Date.parse("2026-09-29T15:00:00.000Z");

/** The lease's own waiting projection over a message to the owner, read against `state`. */
function evidence(
  state: RenewalWorkspaceState | null,
  options: { audience?: "owner" | "tenant"; replied?: boolean } = {},
): LeaseWaiting {
  return leaseWaitingFor(
    state,
    evidenceInput([
      message({
        audience: options.audience ?? "owner",
        cycleId: state?.cycleId ?? null,
        acceptedAtMs: SENT,
        replyAtMs: options.replied ? REPLY : null,
      }),
    ]),
    { leaseId: "lease-318-cedar-7", cycleDateIso: "2026-12-31" },
  );
}

/** The desk row the live desk builds for this staff record, with its real guidance. */
function deskRow(
  manual: NonNullable<Parameters<typeof actionFixture>[0]>["manual"],
  leaseWaiting: LeaseWaiting | null = null,
): Pick<
  DeskLeaseRow,
  "guidance" | "manualProgress" | "staffRecordedAtIso" | "staffRecordUnavailable"
> & { leaseWaiting: LeaseWaiting | null } {
  const { workspace } = actionFixture({ manual });
  return { ...workspace.summary, guidance: workspace.guidance, leaseWaiting };
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
    const owner = manualFixture({ owner: "no_response", done: ["owner_outreach"] });
    const awaitingOwner = deskRow(owner, evidence(owner));
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
      const row = deskRow(manual, evidence(manual));
      expect(row.guidance.overallStatus).toBe("ready");
      expect(row.guidance.action.kind).toBe("act");
      expect(statusOf(row).status).toMatchObject({
        status: "ready",
        waitingOn: "the PMI KC team",
        check: null,
      });
    }

    const tenantState = manualFixture({
      owner: "approved_terms",
      tenant: "awaiting_response",
      done: ["owner_outreach", "tenant_offer"],
    });
    expect(
      statusOf(deskRow(tenantState, evidence(tenantState, { audience: "tenant" })))
        .status,
    ).toMatchObject({ status: "waiting", waitingOn: "the tenant", check: null });

    const completeState = manualFixture({ owner: "approved_terms", completion: true });
    expect(statusOf(deskRow(completeState, evidence(completeState)))).toMatchObject({
      status: {
        status: "complete",
        label: "Completed: recorded by staff",
        waitingOn: null,
      },
      lines: { waiting: null, check: null },
    });
  });

  it("reads Needs a check with both facts and the fix when the staff record and the message disagree", () => {
    // The staff record saved "No response" on 09/30 after the owner's reply on 09/29.
    const owner = manualFixture({ owner: "no_response", done: ["owner_outreach"] });
    expect(statusOf(deskRow(owner, evidence(owner, { replied: true })))).toMatchObject({
      status: {
        status: "needs_check",
        label: "Needs a check",
        waitingOn: null,
        check: {
          audience: "owner",
          subject: "response",
          fix: {
            label: "Record the response",
            target: "renewal-manual-owner_response",
          },
        },
      },
      lines: {
        waiting: null,
        check:
          "The staff record says waiting on the owner. The owner replied on 09/29/2026. Record the response.",
        evidence: "From the staff record, saved 09/30/2026, 7:00 AM CDT",
      },
    });
    const tenant = manualFixture({
      owner: "approved_terms",
      tenant: "awaiting_response",
      done: ["owner_outreach", "tenant_offer"],
    });
    expect(
      statusOf(deskRow(tenant, evidence(tenant, { audience: "tenant", replied: true })))
        .lines.check,
    ).toBe(
      "The staff record says waiting on the tenant. The tenant replied on 09/29/2026. Record the response.",
    );
  });

  it("an accepted send with no reply is one fact, never a check", () => {
    const owner = manualFixture({ owner: "no_response", done: ["owner_outreach"] });
    for (const waiting of [evidence(owner), null])
      expect(statusOf(deskRow(owner, waiting)).status).toMatchObject({
        status: "waiting",
        waitingOn: "the owner",
        check: null,
      });
  });

  it("fails closed when the staff record could not be read", () => {
    const row = deskRow("unreadable", evidence(null));
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
