import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MAINTENANCE_OWNER_DRAFT_ACTION_KEY,
  RENEWAL_DRAFT_ACTION_KEY,
  resolveAskAction,
} from "@/lib/ask/action-intent";

const TARGET = { leaseId: "42", addressLabel: "1234 Oak St" };
const OPEN_KEYS = new Set([RENEWAL_DRAFT_ACTION_KEY, MAINTENANCE_OWNER_DRAFT_ACTION_KEY]);
const isOpen = (key: string) => OPEN_KEYS.has(key);
const allClosed = () => false;

describe("resolveAskAction (AC-S33-1)", () => {
  it("returns a renewal draft route for an open gate + authoritative target", () => {
    const route = resolveAskAction({
      detected: { processId: "lease-renewal" },
      target: TARGET,
      isExecutable: isOpen,
    });
    expect(route).toEqual({
      actionKey: RENEWAL_DRAFT_ACTION_KEY,
      surface: "renewal-notice-draft",
      href: "/lease-renewal/live/desk/lease/42",
      label: "Start the renewal on the live desk",
    });
    // The route is value-free: no recipient, rent, or tenant name.
    expect(JSON.stringify(route)).not.toMatch(/rent|tenant|recipient|email/i);
  });

  it("returns null for a CLOSED gate (never surfaces a live affordance for a closed key)", () => {
    expect(
      resolveAskAction({
        detected: { processId: "lease-renewal" },
        target: TARGET,
        isExecutable: allClosed,
      }),
    ).toBeNull();
  });

  it("returns null when no authoritative target resolved (never a best-guess lease)", () => {
    expect(
      resolveAskAction({
        detected: { processId: "lease-renewal" },
        target: null,
        isExecutable: isOpen,
      }),
    ).toBeNull();
  });

  it("returns null for no detected process or an unmapped process", () => {
    expect(
      resolveAskAction({ detected: null, target: TARGET, isExecutable: isOpen }),
    ).toBeNull();
    expect(
      resolveAskAction({
        detected: { processId: "some-other-process" },
        target: TARGET,
        isExecutable: isOpen,
      }),
    ).toBeNull();
  });

  it("falls back (null) for maintenance until the S38a draft surface is available", () => {
    expect(
      resolveAskAction({
        detected: { processId: "maintenance-work-order-intake" },
        target: null,
        isExecutable: isOpen,
      }),
    ).toBeNull();
    // Once S38a's surface is present the maintenance draft route lights up.
    const route = resolveAskAction({
      detected: { processId: "maintenance-work-order-intake" },
      target: null,
      isExecutable: isOpen,
      maintenanceDraftAvailable: true,
    });
    expect(route?.surface).toBe("maintenance-owner-notice");
    expect(route?.actionKey).toBe(MAINTENANCE_OWNER_DRAFT_ACTION_KEY);
  });

  it("even with the S38a surface present, a closed maintenance gate yields null", () => {
    expect(
      resolveAskAction({
        detected: { processId: "maintenance-work-order-intake" },
        target: null,
        isExecutable: allClosed,
        maintenanceDraftAvailable: true,
      }),
    ).toBeNull();
  });

  it("is deterministic and pure (no wall-clock / network / fs import)", () => {
    const args = {
      detected: { processId: "lease-renewal" as const },
      target: TARGET,
      isExecutable: isOpen,
    };
    expect(resolveAskAction(args)).toEqual(resolveAskAction(args));
    const source = readFileSync(
      fileURLToPath(new URL("../../lib/ask/action-intent.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/Date\.now/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/from\s+["']node:fs["']/);
  });
});
