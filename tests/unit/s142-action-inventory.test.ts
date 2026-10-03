import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  projectRenewalActions,
  type RenewalAction,
} from "@/lib/lease-renewal/renewal-actions";
import {
  RENEWAL_CONTROL_INVENTORY,
  RENEWAL_GOVERNANCE_MATRIX,
  RENEWAL_ROUTE_INVENTORY,
} from "@/lib/lease-renewal/role-action-governance";
import {
  AFTER_ACCEPTANCE,
  actionFixture,
  manualFixture,
} from "@/tests/helpers/renewal-action-fixtures";

// S142: every projected action maps to an existing route, an existing governance capability and
// an existing control inventory entry, or is reported unresolved. No action may name a route, a
// capability or a control that the current code does not already own.

const ROOT = join(__dirname, "..", "..");

function everyAction(): RenewalAction[] {
  const states = [
    null,
    "unreadable" as const,
    manualFixture(),
    manualFixture({ done: ["owner_outreach"] }),
    manualFixture({
      owner: "approved_terms",
      tenant: "accepted",
      done: ["owner_outreach", "tenant_offer"],
    }),
    manualFixture({
      owner: "approved_terms",
      tenant: "accepted",
      done: ["owner_outreach", "tenant_offer", ...AFTER_ACCEPTANCE],
    }),
    manualFixture({ owner: "declined_non_renewal", done: ["owner_outreach"] }),
    manualFixture({
      owner: "declined_non_renewal",
      tenant: "accepted",
      done: ["owner_outreach"],
      termsRevision: 1,
    }),
  ];
  const environments = [
    {},
    { currency: "expired" as const },
    { dispositionReview: true },
    { rentAgreement: "single_source" as const },
    { moveOutInitiated: true },
    { progressUnavailable: true },
    { unavailable: ["writeback_proposal"] },
    { termNeedsReview: true },
  ];
  const actions = new Map<string, RenewalAction>();
  for (const manual of states)
    for (const environment of environments)
      for (const action of projectRenewalActions(
        actionFixture({ ...environment, manual }).snapshot,
      ).actions)
        actions.set(action.id, action);
  // S154: an out-of-window or skipped lease has no inspection-only lane; the staff lane leads
  // there too, so the term review is inventoried from the ordinary fixture above.
  return [...actions.values()];
}

describe("S142 action inventory", () => {
  const actions = everyAction();

  it("covers the staff lane, verification, recovery and source updates", () => {
    const ids = actions.map((action) => action.id);
    // S154/S156 (b7693d4d): there is no reviewed-cycle step; staff actions need no order.
    for (const expected of [
      "manual.preparation",
      "manual.owner_outreach",
      "manual.owner_response",
      "manual.tenant_offer",
      "manual.tenant_response",
      ...AFTER_ACCEPTANCE.map((key) => `manual.${key}`),
      "manual.non_renewal_handoff",
      "manual.complete",
      "manual.branch_conflict",
      "source.refresh",
      "source.staff_records",
      "source.disposition_review",
      "source.term_review",
      "issue.move_out_redirect",
      "evidence.verify-base-rent",
      "evidence.resolve-source-conflicts",
      "support.rentvine",
    ])
      expect(ids, expected).toContain(expected);
  });

  it("names only existing routes, capabilities and controls", () => {
    const inventoried = new Set<string>([
      ...RENEWAL_CONTROL_INVENTORY.flatMap((entry) => entry.enforcementSources),
      ...RENEWAL_ROUTE_INVENTORY.map((entry) => entry.source),
    ]);
    for (const action of actions) {
      if (!action.control) {
        expect(action.status, action.id).toBe("unresolved");
        continue;
      }
      expect(
        RENEWAL_GOVERNANCE_MATRIX[action.control.capability],
        action.id,
      ).toBeDefined();
      for (const route of action.control.routes) {
        const source = `app${route}/route.ts`;
        expect(existsSync(join(ROOT, source)), `${action.id} ${route}`).toBe(true);
        expect(inventoried.has(source), `${action.id} ${source} is governed`).toBe(true);
      }
      expect(
        action.control.targets.length > 0 || action.control.refresh,
        `${action.id} has a usable control`,
      ).toBe(true);
    }
  });

  it("states the completion evidence and who completes every action", () => {
    for (const action of actions) {
      expect(action.evidence.length, action.id).toBeGreaterThan(10);
      expect(action.responsible, action.id).toMatch(/^an? /);
      expect(action.label.trim(), action.id).not.toBe("");
    }
  });
});
