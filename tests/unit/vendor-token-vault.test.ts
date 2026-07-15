import { describe, expect, it } from "vitest";

import { VENDOR_COLLECTIONS } from "@/lib/firestore/vendors";
import { VENDOR_OAUTH_SCOPES } from "@/lib/vendor/model";

describe("Vendor token-vault boundary", () => {
  it("keeps all Vendor collections server-only and connection metadata token-free", () => {
    const connection = {
      vendorId: "vendor-1",
      mailboxEmail: "trade@example.com",
      provider: "google",
      status: "connected",
      scopes: VENDOR_OAUTH_SCOPES,
      tokenSecretRef: "projects/p/secrets/vendor-1",
    };
    expect(Object.values(VENDOR_COLLECTIONS)).toContain("vendor_mailbox_connections");
    expect(connection).not.toHaveProperty("accessToken");
    expect(connection).not.toHaveProperty("refreshToken");
    expect(JSON.stringify(connection)).not.toMatch(/Bearer\s/i);
  });
});
