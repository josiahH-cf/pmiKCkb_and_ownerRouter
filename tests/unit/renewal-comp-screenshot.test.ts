import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isActionExecutable } from "@/lib/integrations/action-gate";
import {
  RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
  RENEWAL_COMP_SCREENSHOT_CLOSED_MESSAGE,
  getRenewalCompScreenshotActionView,
  renewalCompScreenshotClosedResponse,
} from "@/lib/lease-renewal/comp-screenshot-action";
import { RENTCAST_LISTINGS_ACTION_KEY } from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";

// AC-S28-5: both new actions are seeded production_allowed:false and absent from the executable allowlist,
// so they are non-executable and their routes refuse with the closed-action response until a gate flip.

const mocks = vi.hoisted(() => ({ requireCapabilityInSpace: vi.fn() }));
vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});

describe("renewal comp-screenshot + rentcast gates (committed seed, gated OFF)", () => {
  it("both new action keys are non-executable in the committed seed", () => {
    expect(isActionExecutable(RENEWAL_COMP_SCREENSHOT_ACTION_KEY)).toBe(false);
    expect(isActionExecutable(RENTCAST_LISTINGS_ACTION_KEY)).toBe(false);
  });

  it("the comp-screenshot action view reports closed with a continue-without message", () => {
    const view = getRenewalCompScreenshotActionView();
    expect(view.executable).toBe(false);
    expect(view.message).toBe(RENEWAL_COMP_SCREENSHOT_CLOSED_MESSAGE);
    expect(view.actionKey).toBe("google_drive.renewal_comp_screenshot.store");
  });

  it("the closed response carries the action_not_production_allowed error type", () => {
    expect(renewalCompScreenshotClosedResponse()).toEqual({
      action_key: "google_drive.renewal_comp_screenshot.store",
      error: RENEWAL_COMP_SCREENSHOT_CLOSED_MESSAGE,
      error_type: "action_not_production_allowed",
    });
  });
});

describe("POST /api/lease-renewal/comp-screenshot (gated OFF) (AC-S28-4)", () => {
  beforeEach(() => {
    mocks.requireCapabilityInSpace.mockResolvedValue({
      uid: "editor-1",
      email: "editor@pmikcmetro.com",
      role: "Editor",
    });
  });
  afterEach(() => vi.clearAllMocks());

  it("refuses with 409 + action_not_production_allowed before touching any bytes", async () => {
    const { POST } = await import("@/app/api/lease-renewal/comp-screenshot/route");
    const res = await POST(
      new Request("http://localhost/api/lease-renewal/comp-screenshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: "x.png",
          mimeType: "image/png",
          base64: "AAAA",
        }),
      }),
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error_type: string; action_key: string };
    expect(json.error_type).toBe("action_not_production_allowed");
    expect(json.action_key).toBe("google_drive.renewal_comp_screenshot.store");
  });
});
