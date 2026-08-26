import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isActionExecutable } from "@/lib/integrations/action-gate";
import {
  RENEWAL_COMP_SCREENSHOT_ACTION_KEY,
  RENEWAL_COMP_SCREENSHOT_CLOSED_MESSAGE,
  getRenewalCompScreenshotActionView,
  renewalCompScreenshotClosedResponse,
} from "@/lib/lease-renewal/comp-screenshot-action";
import { RENTCAST_LISTINGS_ACTION_KEY } from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";

// The Drive screenshot action remains closed. S59's read-only RentCast action was separately reviewed
// and activated for Production on 2026-08-26; activation does not widen the screenshot effect.

const mocks = vi.hoisted(() => ({ requireCapabilityInSpace: vi.fn() }));
vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});

describe("renewal comp-screenshot + rentcast gates (independent committed keys)", () => {
  it("keeps screenshot storage closed while the reviewed RentCast read is executable", () => {
    expect(isActionExecutable(RENEWAL_COMP_SCREENSHOT_ACTION_KEY)).toBe(false);
    expect(isActionExecutable(RENTCAST_LISTINGS_ACTION_KEY)).toBe(true);
  });

  it("the comp-screenshot action view reports closed with a continue-without message", async () => {
    const view = await getRenewalCompScreenshotActionView();
    expect(view.executable).toBe(false);
    expect(view.message).toBe(RENEWAL_COMP_SCREENSHOT_CLOSED_MESSAGE);
    expect(view.message).toBe(
      "Screenshot storage is not available yet. Continue without a screenshot.",
    );
    expect(view.actionKey).toBe("google_drive.renewal_comp_screenshot.store");
    expect(view.targetLabel).toBe("PMI KC in-boundary Drive image folder");
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
