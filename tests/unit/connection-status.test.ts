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
