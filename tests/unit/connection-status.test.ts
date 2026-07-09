import { describe, expect, it } from "vitest";

import { CONNECTORS } from "@/lib/connections/connector-catalog";
import {
  buildConnectionView,
  classifyConnector,
} from "@/lib/connections/connection-status";
import { readConnectorPresence } from "@/lib/connections/connector-presence";

const rentvine = CONNECTORS.find((c) => c.id === "rentvine")!;
const dotloop = CONNECTORS.find((c) => c.id === "dotloop")!;

describe("readConnectorPresence", () => {
  it("reports presence by name and treats blank / empty-map as absent", () => {
    const presence = readConnectorPresence({
      RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
      RENTVINE_API_KEY: "x",
      RENTVINE_API_SECRET: "y",
      RENEWAL_SHEET_ID: "   ",
      SPACE_DRIVE_FOLDER_IDS: "{}",
    });
    expect(presence.RENTVINE_API_KEY).toBe(true);
    expect(presence.RENEWAL_SHEET_ID).toBe(false);
    expect(presence.SPACE_DRIVE_FOLDER_IDS).toBe(false);
  });
});

describe("classifyConnector", () => {
  it("is Ready to verify when all api-key details are present", () => {
    const status = classifyConnector(rentvine, {
      RENTVINE_API_BASE_URL: true,
      RENTVINE_API_KEY: true,
      RENTVINE_API_SECRET: true,
    });
    expect(status.state).toBe("action");
    expect(status.label).toBe("Ready to verify");
    // Detail stays plain and present-true — no not-yet-live verification promise.
    expect(status.detail).toBe("Ready to connect.");
    expect(status.configuredCount).toBe(3);
  });

  it("is Not connected when no details are present", () => {
    expect(classifyConnector(rentvine, {}).state).toBe("none");
  });

  it("Needs attention when only partially configured", () => {
    const status = classifyConnector(rentvine, { RENTVINE_API_KEY: true });
    expect(status.state).toBe("action");
    expect(status.label).toBe("Needs attention");
  });

  it("treats an OAuth connector with no stored config as Not connected", () => {
    expect(classifyConnector(dotloop, {}).state).toBe("none");
  });

  it("is Connected once verified", () => {
    expect(classifyConnector(rentvine, {}, true).state).toBe("connected");
  });

  it("keeps the per-user Gmail inbox connector honestly gated (no config, no probe)", () => {
    const gmailInbox = CONNECTORS.find((c) => c.id === "gmail_inbox")!;
    // Empty requiredConfig + no health-check ref means it is never wired to a live verify path, so its
    // card reads "Not connected" until the access model + DWD scopes are authorized (Slice F).
    expect(gmailInbox.requiredConfig).toEqual([]);
    expect(gmailInbox.healthCheckRef).toBeUndefined();
    expect(classifyConnector(gmailInbox, {}).state).toBe("none");
  });
});

describe("connector copy voice", () => {
  // Lexicon guard (docs/voice-and-audience.md): no internal jargon in client-facing copy, so
  // later suites inherit the standard. F-VOICE in docs/facts.md records this pass.
  it("keeps internal jargon out of every connector's powers line", () => {
    for (const def of CONNECTORS) {
      expect(def.powers).not.toMatch(/source of truth|control plane|PMI handles/i);
      // The app calls itself "the app" and writes without em dashes (voice rules v2).
      expect(def.powers).not.toMatch(/—/);
    }
  });

  it("describes RentVine in plain operator terms", () => {
    expect(rentvine.powers).toBe("Leases, tenants, and rent.");
  });
});

describe("buildConnectionView", () => {
  it("classifies every connector and the buckets sum to the total", () => {
    const view = buildConnectionView({});
    expect(view.items).toHaveLength(CONNECTORS.length);
    expect(view.summary.total).toBe(CONNECTORS.length);
    expect(view.summary.connected + view.summary.action + view.summary.none).toBe(
      CONNECTORS.length,
    );
  });
});
