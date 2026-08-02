import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

const TEST_LANE_ROUTES = Object.freeze([
  "app/api/admin/v1/fake-acceptance/route.ts",
  "app/api/admin/vendors/test/[vendorId]/audit/route.ts",
  "app/api/admin/vendors/test/route.ts",
  "app/api/approval-queue/test-fixtures/route.ts",
  "app/api/lease-renewal/test-runs/[runId]/business-events/route.ts",
  "app/api/lease-renewal/test-runs/[runId]/route.ts",
  "app/api/lease-renewal/test-runs/[runId]/test-actions/route.ts",
  "app/api/lease-renewal/test-runs/route.ts",
  "app/api/maintenance/tickets/[ticketId]/test-actions/route.ts",
  "app/api/maintenance/tickets/test-seed/route.ts",
  "app/api/process-definitions/[definitionId]/test-runs/route.ts",
  "app/api/spaces/[spaceId]/publications/test-fixture/route.ts",
  "app/api/vendor/tickets/[ticketId]/test-mailbox/route.ts",
  "app/api/workflow-runs/[runId]/route.ts",
  "app/api/workflow-runs/[runId]/step-checks/route.ts",
]);

describe("S56 retired Test-lane route fence", () => {
  it.each(TEST_LANE_ROUTES)(
    "%s fences every handler immediately after authorization",
    (relativePath) => {
      const source = readFileSync(resolve(root, relativePath), "utf8");
      const handlers = source.split(/(?=export async function )/).slice(1);

      expect(handlers.length).toBeGreaterThan(0);
      for (const handler of handlers) {
        expect(handler).toMatch(
          /await require(?:Capability(?:InSpace)?|VendorSession)\([\s\S]*?\);\s*assertTestLaneSurfaceAllowed\(\);/,
        );
      }
    },
  );

  it("fences both newly minted and already-signed Test maintenance intake tokens", () => {
    const tokenRoute = readFileSync(
      resolve(root, "app/api/maintenance/intake/token/route.ts"),
      "utf8",
    );
    const publicRoute = readFileSync(
      resolve(root, "app/api/maintenance/intake/public/route.ts"),
      "utf8",
    );

    const tokenGuard = "assertTestDataModeWriteAllowed(input.dataMode);";
    const publicGuard = "assertTestDataModeWriteAllowed(verified.payload.dataMode);";
    expect(tokenRoute).toContain(tokenGuard);
    expect(publicRoute).toContain(publicGuard);
    expect(tokenRoute.indexOf(tokenGuard)).toBeLessThan(
      tokenRoute.indexOf("const propertyKey = normalizeIntakePropertyKey"),
    );
    expect(publicRoute.indexOf(publicGuard)).toBeLessThan(
      publicRoute.indexOf("const body = await readBoundedText"),
    );
    expect(publicRoute.indexOf(publicGuard)).toBeLessThan(
      publicRoute.indexOf("await createUnverifiedIntakeFromPublic"),
    );
  });

  it("fences an existing Test Vendor before a session cookie or store update", () => {
    const auth = readFileSync(resolve(root, "lib/vendor/auth.ts"), "utf8");
    const tickets = readFileSync(
      resolve(root, "app/api/vendor/tickets/route.ts"),
      "utf8",
    );

    expect(auth).toContain("assertVendorPrincipalLaneAllowed(principal)");
    expect(auth).toContain("if (principal) assertVendorPrincipalLaneAllowed(principal)");
    expect(auth.indexOf("assertVendorPrincipalLaneAllowed(principal)")).toBeLessThan(
      auth.indexOf("const sessionCookie = await createFirebaseSessionCookie"),
    );
    expect(tickets).toContain("assertVendorPrincipalLaneAllowed(principal)");
    expect(tickets.indexOf("assertVendorPrincipalLaneAllowed(principal)")).toBeLessThan(
      tickets.indexOf("new FirestoreVendorStore"),
    );
  });

  it("fences Test intake promotion and Test ticket transition before writes", () => {
    const intakeReview = readFileSync(
      resolve(root, "lib/firestore/maintenance-intake-review.ts"),
      "utf8",
    );
    const tickets = readFileSync(
      resolve(root, "lib/firestore/maintenance-tickets.ts"),
      "utf8",
    );
    const intakeGuard = "assertTestDataModeWriteAllowed(intake.data_mode);";
    const ticketGuard = "assertTestDataModeWriteAllowed(ticket.data_mode);";

    expect(intakeReview).toContain(intakeGuard);
    expect(intakeReview.indexOf(intakeGuard)).toBeLessThan(
      intakeReview.indexOf("const ticketId = uuidv7();"),
    );
    expect(tickets).toContain(ticketGuard);
    expect(tickets.indexOf(ticketGuard)).toBeLessThan(
      tickets.indexOf("let updated: MaintenanceTicketRecord"),
    );
  });
});
