import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The mint route stamps the token with the property's live revocation epoch; stub that read so this
// test never needs Firestore / the Admin SDK.
vi.mock("@/lib/firestore/maintenance-unverified-intake", () => ({
  readIntakeEpoch: vi.fn(async () => 0),
}));

import { POST } from "@/app/api/maintenance/intake/token/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { verifyIntakeToken } from "@/lib/maintenance/intake-token";
import { MAINTENANCE_TEST_PUBLIC_INTAKE } from "@/lib/maintenance/test-workflow";

const SECRET = "mint-secret";

function req(body: unknown) {
  return new Request("http://localhost/api/maintenance/intake/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "josiah@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

beforeEach(() => {
  process.env.MAINTENANCE_INTAKE_TOKEN_SECRET = SECRET;
});

afterEach(() => {
  setAuthResolverForTest(null);
  delete process.env.MAINTENANCE_INTAKE_TOKEN_SECRET;
});

describe("mint intake token route", () => {
  it("returns 401 when unauthenticated", async () => {
    setAuthResolverForTest(() => null);
    const res = await POST(req({ propertyKey: "prop-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 503 when no signing secret is configured (fail closed)", async () => {
    delete process.env.MAINTENANCE_INTAKE_TOKEN_SECRET;
    setEditor();
    const res = await POST(req({ propertyKey: "prop-1" }));
    expect(res.status).toBe(503);
  });

  it("rejects an invalid property key with 400", async () => {
    setEditor();
    const res = await POST(req({ propertyKey: "../evil" }));
    expect(res.status).toBe(400);
  });

  it("mints a verifiable single-use token for an editor", async () => {
    setEditor();
    const res = await POST(req({ propertyKey: "prop-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.propertyKey).toBe("prop-1");
    expect(body.dataMode).toBe("live");
    expect(body.singleUse).toBe(true);
    expect(body.tokenHeader).toBe("X-Intake-Token");
    const verified = verifyIntakeToken(SECRET, body.token, Date.now());
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.propertyKey).toBe("prop-1");
      expect(verified.payload.singleUse).toBe(true);
      expect(verified.payload.dataMode).toBe("live");
    }
  });

  it("mints a one-day single-use token for only the canonical Test fixture", async () => {
    setEditor();
    const res = await POST(
      req({
        propertyKey: MAINTENANCE_TEST_PUBLIC_INTAKE.propertyKey,
        dataMode: "test",
        ttlDays: 7,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      propertyKey: MAINTENANCE_TEST_PUBLIC_INTAKE.propertyKey,
      dataMode: "test",
      singleUse: true,
      testSubmission: MAINTENANCE_TEST_PUBLIC_INTAKE,
    });
    const verified = verifyIntakeToken(SECRET, body.token, Date.now());
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.dataMode).toBe("test");
      expect(verified.payload.singleUse).toBe(true);
      expect(verified.payload.exp - verified.payload.iat).toBeLessThanOrEqual(
        24 * 60 * 60 * 1000,
      );
    }
  });

  it("rejects a Test token for a non-Test property or a reusable Test link", async () => {
    setEditor();
    expect((await POST(req({ propertyKey: "prop-1", dataMode: "test" }))).status).toBe(
      400,
    );
    expect(
      (
        await POST(
          req({
            propertyKey: MAINTENANCE_TEST_PUBLIC_INTAKE.propertyKey,
            dataMode: "test",
            reusable: true,
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("caps a single-use token at 7 days even if a longer ttl is requested", async () => {
    setEditor();
    const res = await POST(req({ propertyKey: "prop-1", ttlDays: 30 }));
    const body = await res.json();
    const verified = verifyIntakeToken(SECRET, body.token, Date.now());
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      const days = (verified.payload.exp - verified.payload.iat) / (24 * 60 * 60 * 1000);
      expect(days).toBeLessThanOrEqual(7);
    }
  });
});
