import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isActionExecutable } from "@/lib/integrations/action-gate";
import {
  RENEWAL_GOVERNANCE_MATRIX,
  RENEWAL_CONTROL_INVENTORY,
  RENEWAL_ROUTE_INVENTORY,
  assertRenewalRoleAuthority,
  evaluateRenewalAuthority,
  type RenewalCapabilityKey,
} from "@/lib/lease-renewal/role-action-governance";

const PAGE_EXPECTATIONS = [
  ["app/lease-renewal/page.tsx", "read_workspace"],
  ["app/lease-renewal/lease/[leaseId]/page.tsx", "read_workspace"],
  ["app/lease-renewal/live/page.tsx", "read_workspace"],
  ["app/lease-renewal/live/desk/page.tsx", "read_workspace"],
  ["app/lease-renewal/live/desk/lease/[leaseId]/page.tsx", "read_workspace"],
  ["app/lease-renewal/live/notices/page.tsx", "read_workspace"],
  ["app/lease-renewal/property/[propertyKey]/page.tsx", "read_workspace"],
  ["app/lease-renewal/runs/page.tsx", "read_workspace"],
  ["app/lease-renewal/runs/[runId]/page.tsx", "read_workspace"],
  ["app/lease-renewal/runs/[runId]/reconciliation/[fieldKey]/page.tsx", "read_workspace"],
] as const satisfies readonly (readonly [string, RenewalCapabilityKey])[];

const API_EXPECTATIONS = [
  ["app/api/lease-renewal/comp-screenshot/route.ts", "GET", "screenshot_store"],
  ["app/api/lease-renewal/comp-screenshot/route.ts", "POST", "screenshot_store"],
  [
    "app/api/lease-renewal/comp-screenshot/rollback/route.ts",
    "POST",
    "screenshot_rollback",
  ],
  ["app/api/lease-renewal/decider-progress/route.ts", "GET", "read_workspace"],
  ["app/api/lease-renewal/decider-progress/route.ts", "POST", "save_navigation_progress"],
  ["app/api/lease-renewal/discrepancy-dispositions/route.ts", "GET", "read_workspace"],
  [
    "app/api/lease-renewal/discrepancy-dispositions/route.ts",
    "POST",
    "record_discrepancy_disposition",
  ],
  [
    "app/api/lease-renewal/follow-up-attention/route.ts",
    "POST",
    "manage_follow_up_attention",
  ],
  ["app/api/lease-renewal/market-comps/route.ts", "POST", "request_reference_comps"],
  ["app/api/lease-renewal/packet-truth/route.ts", "GET", "read_workspace"],
  ["app/api/lease-renewal/packet-truth/route.ts", "POST", "save_packet_truth"],
  ["app/api/lease-renewal/refresh/route.ts", "POST", "refresh_source_facts"],
  ["app/api/lease-renewal/renewal-copy-assist/route.ts", "POST", "tailor_copy"],
  ["app/api/lease-renewal/renewal-notice-draft/route.ts", "POST", "draft_create"],
  ["app/api/lease-renewal/renewal-progress/route.ts", "POST", "save_renewal_progress"],
  ["app/api/lease-renewal/rent-suggestion/route.ts", "GET", "read_workspace"],
  [
    "app/api/lease-renewal/rent-suggestion/route.ts",
    "POST",
    "approve_pricing_suggestion",
  ],
  ["app/api/lease-renewal/rentvine-writeback/route.ts", "POST", "execute_source_write"],
  ["app/api/lease-renewal/operating-sheet/route.ts", "POST", "execute_source_write"],
  ["app/api/lease-renewal/term-review/route.ts", "GET", "read_workspace"],
  ["app/api/lease-renewal/term-review/route.ts", "POST", "record_term_review"],
  ["app/api/lease-renewal/resolve/route.ts", "POST", "resolve_reconciliation"],
  [
    "app/api/lease-renewal/writeback-approvals/bulk/route.ts",
    "POST",
    "approve_source_write",
  ],
  ["app/api/lease-renewal/writeback-approvals/route.ts", "POST", "approve_source_write"],
  ["app/api/lease-renewal/writeback-execute/route.ts", "POST", "execute_source_write"],
] as const satisfies readonly (readonly [string, "GET" | "POST", RenewalCapabilityKey])[];

describe("S80 renewal role and action governance", () => {
  it("lets a managed Renewals-space Editor perform every approved ordinary-work row", () => {
    for (const capability of [
      "read_workspace",
      "save_navigation_progress",
      "record_discrepancy_disposition",
      "manage_follow_up_attention",
      "save_packet_truth",
      "refresh_source_facts",
      "save_renewal_progress",
      "tailor_copy",
    ] as const) {
      expect(
        evaluateRenewalAuthority(capability, {
          role: "Editor",
          managedIdentity: true,
          hasRenewalsSpace: true,
        }),
      ).toMatchObject({ code: "allowed", effectConstructable: true });
    }
  });

  it("keeps pricing, reconciliation, source approval, and Admin configuration at distinct stronger roles", () => {
    expect(
      evaluateRenewalAuthority("approve_pricing_suggestion", {
        role: "Editor",
        managedIdentity: true,
        hasRenewalsSpace: true,
      }),
    ).toMatchObject({ code: "insufficient_role", effectConstructable: false });
    expect(
      evaluateRenewalAuthority("approve_pricing_suggestion", {
        role: "Approver",
        managedIdentity: true,
        hasRenewalsSpace: true,
      }),
    ).toMatchObject({ code: "insufficient_role", effectConstructable: false });
    expect(
      evaluateRenewalAuthority("resolve_reconciliation", {
        role: "Approver",
        managedIdentity: true,
        hasRenewalsSpace: true,
      }),
    ).toMatchObject({ code: "allowed", effectConstructable: true });
    expect(
      evaluateRenewalAuthority("manage_renewal_configuration", {
        role: "Approver",
        managedIdentity: true,
        hasRenewalsSpace: true,
      }),
    ).toMatchObject({ code: "insufficient_role", effectConstructable: false });
    expect(
      evaluateRenewalAuthority("approve_source_write", {
        role: "Admin",
        managedIdentity: true,
        hasRenewalsSpace: true,
      }),
    ).toMatchObject({ code: "allowed", effectConstructable: true });
  });

  it("treats identity, Space, role, exact action, suspension, confirmation, and quota as conjunctive", () => {
    const base = {
      role: "Editor" as const,
      managedIdentity: true,
      hasRenewalsSpace: true,
    };

    expect(
      evaluateRenewalAuthority("request_reference_comps", {
        ...base,
        managedIdentity: false,
        externalState: "ready",
      }),
    ).toMatchObject({ code: "unmanaged_identity", effectConstructable: false });
    expect(
      evaluateRenewalAuthority("request_reference_comps", {
        ...base,
        hasRenewalsSpace: false,
        externalState: "ready",
      }),
    ).toMatchObject({ code: "missing_space", effectConstructable: false });
    expect(
      evaluateRenewalAuthority("request_reference_comps", {
        ...base,
        externalState: "closed",
      }),
    ).toMatchObject({ code: "action_closed", effectConstructable: false });
    expect(
      evaluateRenewalAuthority("request_reference_comps", {
        ...base,
        externalState: "suspended",
      }),
    ).toMatchObject({ code: "action_suspended", effectConstructable: false });
    expect(
      evaluateRenewalAuthority("request_reference_comps", {
        ...base,
        externalState: "quota_exhausted",
      }),
    ).toMatchObject({ code: "quota_exhausted", effectConstructable: false });
    expect(
      evaluateRenewalAuthority("draft_create", {
        ...base,
        externalState: "ready",
        exactConfirmation: false,
      }),
    ).toMatchObject({ code: "confirmation_required", effectConstructable: false });
    expect(
      evaluateRenewalAuthority("draft_create", {
        ...base,
        externalState: "ready",
        exactConfirmation: true,
      }),
    ).toMatchObject({ code: "allowed", effectConstructable: true });
  });

  it("never lets any role or exact-key state authorize an in-app send or a closed source write", () => {
    for (const role of ["Editor", "Approver", "Admin"] as const) {
      expect(
        evaluateRenewalAuthority("send_renewal_message", {
          role,
          managedIdentity: true,
          hasRenewalsSpace: true,
          externalState: "ready",
          exactConfirmation: true,
        }),
      ).toMatchObject({ code: "permanently_forbidden", effectConstructable: false });
    }

    expect(
      evaluateRenewalAuthority("execute_source_write", {
        role: "Admin",
        managedIdentity: true,
        hasRenewalsSpace: true,
        externalState: "closed",
        exactConfirmation: true,
      }),
    ).toMatchObject({ code: "action_closed", effectConstructable: false });
  });

  it("preserves the committed exact-key boundary independently of every role row", () => {
    expect(isActionExecutable("rentcast.rental_listings.search")).toBe(true);
    expect(isActionExecutable("gmail.renewal_notice.draft_create")).toBe(true);
    expect(isActionExecutable("google_drive.renewal_comp_screenshot.store")).toBe(false);
    expect(isActionExecutable("rentvine.lease.renewal_writeback")).toBe(false);
    expect(isActionExecutable("google_sheets.renewal_checklist.writeback")).toBe(false);
    expect(isActionExecutable("gmail.renewal_notice.send")).toBe(false);
    expect(isActionExecutable("gmail.message.send")).toBe(false);
  });

  it("projects every renewal page and API method through the declared matrix row", () => {
    expect(discoverRenewalPages()).toEqual(
      new Set(PAGE_EXPECTATIONS.map(([source]) => source)),
    );
    expect(discoverRenewalApiMethods()).toEqual(
      new Set(API_EXPECTATIONS.map(([source, method]) => `${source}:${method}`)),
    );

    expect(
      RENEWAL_ROUTE_INVENTORY.filter((entry) => entry.kind === "page").map(
        ({ source, capability }) => [source, capability],
      ),
    ).toEqual(PAGE_EXPECTATIONS);
    expect(
      RENEWAL_ROUTE_INVENTORY.filter((entry) => entry.kind === "api").map(
        ({ source, method, capability }) => [source, method, capability],
      ),
    ).toEqual(API_EXPECTATIONS);

    for (const [source, capability] of PAGE_EXPECTATIONS) {
      const body = readFileSync(join(process.cwd(), source), "utf8");
      expect(body, `${source} must project ${capability}`).toContain(
        `renewalRoleCapability("${capability}")`,
      );
    }
    for (const [source, , capability] of API_EXPECTATIONS) {
      const body = readFileSync(join(process.cwd(), source), "utf8");
      expect(
        sourceProjects(body, capability),
        `${source} must project ${capability}`,
      ).toBe(true);
    }
  });

  it("maps every rendered renewal control to the page or API enforcement source", () => {
    for (const entry of RENEWAL_CONTROL_INVENTORY) {
      expect(
        readFileSync(join(process.cwd(), entry.source), "utf8").length,
      ).toBeGreaterThan(0);
      for (const source of entry.enforcementSources) {
        const body = readFileSync(join(process.cwd(), source), "utf8");
        expect(
          sourceProjects(body, entry.capability),
          `${entry.control} must project ${entry.capability} in ${source}`,
        ).toBe(true);
      }
    }
  });

  it("uses the same specific refusal and safe next action at the direct API boundary", () => {
    expect(() =>
      assertRenewalRoleAuthority("approve_pricing_suggestion", "Editor"),
    ).toThrowError(
      /Admin authority is required.*Leave the suggestion pending for Admin review/,
    );
    expect(() =>
      assertRenewalRoleAuthority("resolve_reconciliation", "Editor"),
    ).toThrowError(/Approver or Admin authority is required.*Defer the item/);
    expect(() =>
      assertRenewalRoleAuthority("send_renewal_message", "Admin"),
    ).toThrowError(/never sends renewal messages.*send from Gmail/);
    expect(() =>
      assertRenewalRoleAuthority("approve_pricing_suggestion", "Admin"),
    ).not.toThrow();
  });

  it("contains no per-person grant dimension and keeps role separate from every exact action key", () => {
    const serialized = JSON.stringify(RENEWAL_GOVERNANCE_MATRIX);
    expect(serialized).not.toMatch(/person|delegate|inherit|assignee/i);
    for (const row of Object.values(RENEWAL_GOVERNANCE_MATRIX)) {
      expect(row.roleCapability).not.toMatch(/\./);
      for (const actionKey of row.actionKeys) {
        expect(actionKey).toMatch(/^[a-z0-9_]+\.[a-z0-9_.]+$/);
        expect(row.roleCapability).not.toBe(actionKey);
      }
    }
  });
});

function discoverRenewalPages(): Set<string> {
  return new Set(
    walk(join(process.cwd(), "app/lease-renewal"))
      .filter((path) => path.endsWith("/page.tsx"))
      .map(relativeToRepository)
      .sort(),
  );
}

function discoverRenewalApiMethods(): Set<string> {
  const discovered = new Set<string>();
  for (const absolutePath of walk(join(process.cwd(), "app/api/lease-renewal"))) {
    if (!absolutePath.endsWith("/route.ts")) continue;
    const source = relativeToRepository(absolutePath);
    const body = readFileSync(absolutePath, "utf8");
    const methods = new Set<string>();
    for (const match of body.matchAll(
      /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g,
    )) {
      methods.add(match[1]);
    }
    for (const match of body.matchAll(
      /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g,
    )) {
      methods.add(match[1]);
    }
    for (const match of body.matchAll(/export\s+const\s+\{([^}]+)\}\s*=/g)) {
      for (const candidate of match[1].split(",").map((value) => value.trim())) {
        if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(candidate)) methods.add(candidate);
      }
    }
    for (const method of methods) discovered.add(`${source}:${method}`);
  }
  return discovered;
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function relativeToRepository(path: string): string {
  return path.slice(process.cwd().length + 1).replaceAll("\\", "/");
}

function sourceProjects(body: string, capability: RenewalCapabilityKey): boolean {
  return ["renewalRoleCapability", "assertRenewalRoleAuthority"].some((functionName) =>
    new RegExp(`${functionName}\\(\\s*["']${capability}["']`).test(body),
  );
}
