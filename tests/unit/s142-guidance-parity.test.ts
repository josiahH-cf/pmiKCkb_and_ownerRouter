import { describe, expect, it } from "vitest";

import {
  LEASE_WAITING_VERSION,
  leaseWaitingCheck,
  type LeaseWaiting,
} from "@/lib/lease-renewal/lease-waiting";
import {
  deskLeaseWorkStatusInput,
  focusLeaseWorkStatusInput,
  projectLeaseWorkStatus,
} from "@/lib/lease-renewal/lease-work-status";
import {
  projectRenewalActions,
  renewalGuidanceActionId,
  type RenewalActionProjection,
} from "@/lib/lease-renewal/renewal-actions";
import {
  manualActionLabel,
  manualRenewalSummary,
  type ManualActivity,
} from "@/lib/lease-renewal/workspace-state";
import {
  AFTER_ACCEPTANCE,
  actionFixture,
  manualFixture,
  type ActionFixtureOptions,
  type ManualFixture,
} from "@/tests/helpers/renewal-action-fixtures";

// S142 (ARCH-S142-1): the dependency projection and the single S127 guidance read the same shared
// predicates, so for every generated state the projection's headline is the action the guidance
// names. The one principled difference: when the named action is itself waiting on an unmet
// prerequisite, the projection leads to that resolvable prerequisite instead.
// S156 (8a3f929d, 0f02e013): the staff lane leads on every lease, there is no prerequisite chain
// between staff actions, and a staff completion record is accepted over unfinished guidance
// items. The guidance then names completion (no next action), and the projection must agree.

const OWNER = [
  undefined,
  "no_response",
  "revision_requested",
  "approved_terms",
  "declined_non_renewal",
] as const;
const TENANT = [
  undefined,
  "awaiting_response",
  "accepted",
  "counter_change_requested",
  "declined_nonrenewing",
  "needs_verification",
] as const;
const DONE: readonly (readonly ManualActivity[])[] = [
  [],
  ["owner_outreach"],
  ["owner_outreach", "tenant_offer"],
  ["owner_outreach", "tenant_offer", ...AFTER_ACCEPTANCE.slice(0, 6)],
  ["owner_outreach", "tenant_offer", ...AFTER_ACCEPTANCE],
  ["tenant_offer", ...AFTER_ACCEPTANCE],
  ["owner_outreach", "tenant_offer", ...AFTER_ACCEPTANCE, "non_renewal_handoff"],
];

function manualStates(): (ManualFixture | null | "unreadable")[] {
  const states: (ManualFixture | null | "unreadable")[] = [null, "unreadable"];
  for (const owner of OWNER)
    for (const tenant of TENANT)
      for (const done of DONE)
        for (const completion of [false, true])
          states.push({
            ...(owner ? { owner } : {}),
            ...(tenant ? { tenant } : {}),
            done,
            completion,
          });
  return states;
}

const ENVIRONMENTS: readonly Omit<ActionFixtureOptions, "manual">[] = [
  {},
  { currency: "expired" },
  { readComplete: false },
  { dispositionReview: true },
  { rentAgreement: "single_source" },
  { rentAgreement: "missing" },
  { progressUnavailable: true },
  { moveOutInitiated: true },
  { role: "Approver" },
  { role: "Admin", leaseId: "lease-4821-maple-4" },
  { leaseId: "lease-1207-walnut-2" },
];

function headlineMatches(projection: RenewalActionProjection, expected: string | null) {
  if (projection.headlineActionId === expected) return true;
  const named = projection.actions.find((action) => action.id === expected);
  return (
    named?.status === "dependency_blocked" &&
    projection.headlineActionId !== null &&
    named.resolvableVia.includes(projection.headlineActionId)
  );
}

describe("S142 guidance parity", () => {
  it("names the same next action as the S127 guidance across the generated state matrix", () => {
    let compared = 0;
    const mismatches: string[] = [];
    for (const manual of manualStates())
      for (const environment of ENVIRONMENTS) {
        const state =
          manual === null || manual === "unreadable"
            ? manual
            : manualFixture(manual, environment.leaseId ?? "lease-318-cedar-7");
        const { snapshot, workspace } = actionFixture({ ...environment, manual: state });
        const projection = projectRenewalActions(snapshot);
        const expected = renewalGuidanceActionId(snapshot);
        compared += 1;
        if (!headlineMatches(projection, expected)) {
          mismatches.push(
            `${JSON.stringify({ manual, environment })}: guidance ${expected}, projection ${projection.headlineActionId}`,
          );
          continue;
        }
        const headline = projection.actions.find(
          (action) => action.id === projection.headlineActionId,
        );
        const kind = workspace.guidance.action.kind;
        // Status classes agree with the guidance kind.
        if (kind === "complete") expect(projection.outcome.state).toMatch(/^complete/);
        if (kind === "waiting" && headline && headline.id.startsWith("manual."))
          expect(["waiting", "ready_for_actor", "dependency_blocked"]).toContain(
            headline.status,
          );
        // The staff lane uses the guidance's own wording for the named activity.
        if (
          headline?.id.startsWith("manual.") &&
          workspace.guidance.overallStatus !== "needs_verification" &&
          !snapshot.guidance.redirectLabel &&
          typeof state === "object" &&
          state
        )
          expect(headline.label).toBe(
            manualActionLabel(
              manualRenewalSummary(state).nextActivity,
              manualRenewalSummary(state),
            ),
          );
        // Only the recorded owner-decline-with-acceptance conflict produces a diagnostic.
        for (const diagnostic of projection.diagnostics)
          expect(diagnostic.kind, JSON.stringify(manual)).toBe("impossible_condition");
      }
    expect(mismatches).toEqual([]);
    expect(compared).toBeGreaterThan(3000);
  }, 120_000);

  it("S232 R-S232-4: Focus shows the desk row's status, waiting-on and evidence across the matrix", () => {
    // S279 (rewritten on purpose, R-S279-2): the thread side is the lease's own waiting projection,
    // with and without a disagreement, never one viewer's linked Gmail thread.
    const base: LeaseWaiting = {
      version: LEASE_WAITING_VERSION,
      readable: true,
      cycleId: null,
      audience: "owner",
      party: "owner",
      sinceIso: "2026-09-28T15:00:00.000Z",
      lastContactIso: "2026-09-28T15:00:00.000Z",
      check: null,
    };
    const check = leaseWaitingCheck({
      activity: "owner_outreach",
      audience: "owner",
      subject: "response",
      staffRecord: "says the owner response is No response",
      appEvidence: "show an owner reply received",
      staffFact: "waiting on the owner",
      evidenceAtMs: Date.parse("2026-09-29T15:00:00.000Z"),
    });
    const THREADS: readonly (LeaseWaiting | null)[] = [
      null,
      base,
      { ...base, audience: null, party: "team", sinceIso: null },
      { ...base, check },
      { ...base, readable: false, check },
    ];
    let compared = 0;
    const checks = new Set<string>();
    const mismatches: string[] = [];
    for (const manual of manualStates())
      for (const environment of ENVIRONMENTS) {
        const state =
          manual === null || manual === "unreadable"
            ? manual
            : manualFixture(manual, environment.leaseId ?? "lease-318-cedar-7");
        const { snapshot, workspace } = actionFixture({ ...environment, manual: state });
        // The Focus facts are the desk row's own follow-up facts and read time.
        expect(snapshot.leaseStatus).toEqual({
          waiting: workspace.summary.leaseWaiting ?? null,
          sourceReadAtIso: workspace.dataCurrency?.readAtIso ?? null,
        });
        const live = snapshot.manual.readable ? snapshot.manual.state : null;
        const standing =
          snapshot.standingOwnerAuthority?.covered === true &&
          snapshot.standingOwnerAuthority.manualRevision === (live?.revision ?? 0);
        for (const leaseWaiting of THREADS) {
          const desk = projectLeaseWorkStatus(
            deskLeaseWorkStatusInput(
              { ...workspace.summary, guidance: workspace.guidance, leaseWaiting },
              snapshot.leaseStatus!.sourceReadAtIso,
            ),
          );
          const focus = projectLeaseWorkStatus(
            focusLeaseWorkStatusInput({
              serverStatus: snapshot.guidance.status,
              staffRecord: snapshot.manual,
              standingOwnerAuthority: standing,
              waiting: leaseWaiting,
              sourceReadAtIso: snapshot.leaseStatus!.sourceReadAtIso,
            }),
          );
          compared += 1;
          if (desk.check) checks.add(desk.status);
          if (JSON.stringify(desk) !== JSON.stringify(focus))
            mismatches.push(
              `${JSON.stringify({ manual, environment, waiting: leaseWaiting })}: desk ${JSON.stringify(desk)}, focus ${JSON.stringify(focus)}`,
            );
        }
      }
    expect(mismatches).toEqual([]);
    expect(compared).toBeGreaterThan(15000);
    // The matrix reaches the disagreement state, so the comparison is not vacuous.
    expect([...checks]).toEqual(["needs_check"]);
  }, 180_000);

  it("fails against a projection that only follows display order", () => {
    // A recorded tenant counter reopens the owner response even though the offer that follows it
    // in display order is complete; a display-order reading would lead to the tenant answer.
    const { snapshot } = actionFixture({
      manual: manualFixture({
        owner: "approved_terms",
        tenant: "counter_change_requested",
        done: ["owner_outreach", "tenant_offer"],
      }),
    });
    const projection = projectRenewalActions(snapshot);
    const displayOrderFirstOpen = projection.actions.find(
      (action) =>
        action.id.startsWith("manual.") &&
        action.status !== "complete" &&
        action.status !== "not_applicable" &&
        action.id !== "manual.owner_response",
    )?.id;
    expect(renewalGuidanceActionId(snapshot)).toBe("manual.owner_response");
    expect(projection.headlineActionId).toBe("manual.owner_response");
    expect(displayOrderFirstOpen).not.toBe(projection.headlineActionId);
  });
});
