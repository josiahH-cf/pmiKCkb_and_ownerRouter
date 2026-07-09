import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock only the writer function; keep the real error classes so the route's instanceof mapping works.
vi.mock("@/lib/firestore/maintenance-unverified-intake", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/firestore/maintenance-unverified-intake")>();
  return {
    ...actual,
    createUnverifiedIntakeFromPublic: vi.fn(async () => ({ id: "intake_1" })),
  };
});

import { POST } from "@/app/api/maintenance/intake/public/route";
import {
  createUnverifiedIntakeFromPublic,
  IntakeDailyCapError,
  IntakeReplayError,
  IntakeRevokedError,
} from "@/lib/firestore/maintenance-unverified-intake";
import { mintIntakeToken } from "@/lib/maintenance/intake-token";

const SECRET = "route-secret";
const NOW = Date.now();

function token(propertyKey = "prop-abc", overrides = {}) {
  return mintIntakeToken(
    { secret: SECRET, propertyKey, jti: `jti-${Math.random()}`, epoch: 0, ...overrides },
    NOW,
  );
}

// The route holds a module-level rate limiter (best-effort per-instance). Give every request a UNIQUE
// client IP (salt set below) so each hits a fresh bucket — this test exercises auth/validation, not the
// pre-gate, and must not trip a spurious 429.
let ipCounter = 0;
function req(body: string | undefined, headers: Record<string, string> = {}) {
  ipCounter += 1;
  return new Request("http://localhost/api/maintenance/intake/public", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `203.0.113.${ipCounter % 250}, 10.9.${ipCounter}.1`,
      ...headers,
    },
    body,
  });
}

const validBody = JSON.stringify({ summary: "Leaky faucet", contact: "t@example.com" });

beforeEach(() => {
  process.env.MAINTENANCE_INTAKE_TOKEN_SECRET = SECRET;
  process.env.MAINTENANCE_INTAKE_DAILY_CAP = "500";
  process.env.MAINTENANCE_INTAKE_IP_HASH_SALT = "test-salt"; // so each unique XFF gets its own bucket
  vi.mocked(createUnverifiedIntakeFromPublic).mockClear();
  vi.mocked(createUnverifiedIntakeFromPublic).mockResolvedValue({ id: "intake_1" });
});

afterEach(() => {
  delete process.env.MAINTENANCE_INTAKE_TOKEN_SECRET;
  delete process.env.MAINTENANCE_INTAKE_DAILY_CAP;
  delete process.env.MAINTENANCE_INTAKE_IP_HASH_SALT;
});

describe("public maintenance intake route", () => {
  it("fails CLOSED with 503 when no signing secret is configured", async () => {
    delete process.env.MAINTENANCE_INTAKE_TOKEN_SECRET;
    const res = await POST(req(validBody, { "x-intake-token": token() }));
    expect(res.status).toBe(503);
    expect(createUnverifiedIntakeFromPublic).not.toHaveBeenCalled();
  });

  it("returns 401 (generic) with no token", async () => {
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid or missing intake token.");
    expect(createUnverifiedIntakeFromPublic).not.toHaveBeenCalled();
  });

  it("returns 401 (generic) for a forged/invalid token — never constructs the writer", async () => {
    const res = await POST(req(validBody, { "x-intake-token": "garbage.token" }));
    expect(res.status).toBe(401);
    expect(createUnverifiedIntakeFromPublic).not.toHaveBeenCalled();
  });

  it("returns 413 for an over-cap body (streamed size limit)", async () => {
    const huge = JSON.stringify({ summary: "x".repeat(20 * 1024) });
    const res = await POST(req(huge, { "x-intake-token": token() }));
    expect(res.status).toBe(413);
    expect(createUnverifiedIntakeFromPublic).not.toHaveBeenCalled();
  });

  it("returns 400 (generic) for malformed JSON", async () => {
    const res = await POST(req("{ not json", { "x-intake-token": token() }));
    expect(res.status).toBe(400);
    expect(createUnverifiedIntakeFromPublic).not.toHaveBeenCalled();
  });

  it("accepts a valid submission with 202 + a reference that is neither the doc id nor the jti", async () => {
    const t = token("prop-xyz");
    const res = await POST(req(validBody, { "x-intake-token": t }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("received");
    expect(typeof body.reference).toBe("string");
    expect(body.reference).not.toBe("intake_1");
    expect(body.reference).not.toContain("jti-");
    expect(createUnverifiedIntakeFromPublic).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createUnverifiedIntakeFromPublic).mock.calls[0][0]).toMatchObject({
      propertyKey: "prop-xyz",
      summary: "Leaky faucet",
      singleUse: true,
    });
  });

  it("maps a replayed single-use token to 409", async () => {
    vi.mocked(createUnverifiedIntakeFromPublic).mockRejectedValueOnce(
      new IntakeReplayError(),
    );
    const res = await POST(req(validBody, { "x-intake-token": token() }));
    expect(res.status).toBe(409);
  });

  it("maps a revoked token to a GENERIC 401 (no revoked oracle)", async () => {
    vi.mocked(createUnverifiedIntakeFromPublic).mockRejectedValueOnce(
      new IntakeRevokedError(),
    );
    const res = await POST(req(validBody, { "x-intake-token": token() }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid or missing intake token.");
  });

  it("maps the per-property daily cap to 503", async () => {
    vi.mocked(createUnverifiedIntakeFromPublic).mockRejectedValueOnce(
      new IntakeDailyCapError(),
    );
    const res = await POST(req(validBody, { "x-intake-token": token() }));
    expect(res.status).toBe(503);
  });
});
