import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "app/approval-queue/page.tsx"),
  "utf8",
);

describe("S83 specialized access lane boundary", () => {
  it("branches and returns the Admin access lane before every Renewals guard or loader", () => {
    const branch = source.indexOf('resolvedSearchParams?.view === "access"');
    const renewalGuard = source.indexOf('requirePageSpaceAccess("renewals")');
    const renewalLoader = source.indexOf("loadRenewalRunViewContext(user)");
    expect(branch).toBeGreaterThan(0);
    expect(branch).toBeLessThan(renewalGuard);
    expect(branch).toBeLessThan(renewalLoader);
    expect(source.slice(branch, renewalGuard)).toContain(
      'requirePageCapability("manageAdmin")',
    );
    expect(source.slice(branch, renewalGuard)).toContain("<AccessRequestsLane");
  });

  it("does not mirror access requests into generic queue storage or bulk transitions", () => {
    const store = fs.readFileSync(
      path.join(process.cwd(), "lib/access/request-store-firestore.ts"),
      "utf8",
    );
    expect(store).not.toContain("approval_queue_items");
    expect(store).not.toContain("bulkTransitionApprovalQueueItems");
  });
});
