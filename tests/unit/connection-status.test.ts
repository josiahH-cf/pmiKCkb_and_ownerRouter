import { describe, expect, it } from "vitest";

import { CONNECTORS } from "@/lib/connections/connector-catalog";
import {
  buildConnectionView,
  classifyConnector,
  connectionNextStep,
} from "@/lib/connections/connection-status";
import { readConnectorPresence } from "@/lib/connections/connector-presence";
import { LIVE_VERIFIABLE_CONNECTOR_IDS } from "@/lib/connections/verification";

const rentvine = CONNECTORS.find((c) => c.id === "rentvine")!;
const dotloop = CONNECTORS.find((c) => c.id === "dotloop")!;
const rentcast = CONNECTORS.find((c) => c.id === "rentcast")!;
const legacyGmailSender = CONNECTORS.find((c) => c.id === "gmail_sender")!;

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
    expect(status.detail).toBe(
      "Configuration is present. Run the bounded read-only check.",
    );
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

  it("keeps workflow Gmail honest until every non-secret runtime detail is present", () => {
    const gmailInbox = CONNECTORS.find((c) => c.id === "gmail_inbox")!;
    expect(gmailInbox.requiredConfig).toEqual([
      "GMAIL_DWD_SA",
      "GMAIL_PUBSUB_TOPIC",
      "GMAIL_PUBSUB_AUDIENCE",
      "GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT",
    ]);
    expect(gmailInbox.healthCheckRef).toBeUndefined();
    expect(classifyConnector(gmailInbox, {}).state).toBe("none");
    expect(classifyConnector(gmailInbox, { GMAIL_DWD_SA: true }).label).toBe(
      "Needs attention",
    );
    // Transport presence is not a product-health proof, so this connector has no live Verify control.
    expect(LIVE_VERIFIABLE_CONNECTOR_IDS).not.toContain("gmail_inbox");
  });

  it("does not claim an unwired verification control for fully configured connectors", () => {
    const drive = CONNECTORS.find((connector) => connector.id === "google_drive")!;
    const status = classifyConnector(
      drive,
      Object.fromEntries(drive.requiredConfig.map((name) => [name, true])),
    );

    expect(status.label).toBe("Setup complete");
    expect(status.detail).toMatch(/No bounded live verification check is available/);
  });

  it("makes the built RentCast verifier visible without treating connection as action authority", () => {
    expect(rentcast.requiredConfig).toEqual(["RENTCAST_API_KEY"]);
    expect(rentcast.healthCheckRef).toBe("health.rentcast.api_key");
    expect(rentcast.liveVerificationAvailable).toBe(true);
    const status = classifyConnector(rentcast, { RENTCAST_API_KEY: true });
    expect(status.label).toBe("Ready to verify");
    expect(connectionNextStep(status, true)).toContain(
      "Action authority remains a separate check",
    );
  });

  it("classifies the legacy sender as governance-closed instead of disconnected", () => {
    const status = classifyConnector(legacyGmailSender, {});
    expect(status).toMatchObject({
      state: "closed",
      label: "Closed by governance",
      configuredCount: 0,
      requiredCount: 0,
    });
    expect(status.detail).toContain("no connection setup step");
    expect(connectionNextStep(status, true)).toContain("closed by governance");
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
    expect(
      view.summary.connected +
        view.summary.action +
        view.summary.none +
        view.summary.closed,
    ).toBe(CONNECTORS.length);
  });
});
