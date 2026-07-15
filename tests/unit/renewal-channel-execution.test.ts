import { describe, expect, it } from "vitest";

import { renewalOutreachStatus } from "@/lib/lease-renewal/execution/channel-status";

describe("Renewal channel receipts", () => {
  it("keeps email, portal, and SMS receipts separate", () => {
    expect(renewalOutreachStatus({ email: "email-1" })).toMatchObject({
      complete: false,
      claim: "Cross-channel delivery is not verified.",
    });
    expect(
      renewalOutreachStatus({ email: "email-1", portal: "portal-1", sms: "sms-1" }),
    ).toMatchObject({ complete: true, emailSent: true, portalSent: true, smsSent: true });
  });
});
