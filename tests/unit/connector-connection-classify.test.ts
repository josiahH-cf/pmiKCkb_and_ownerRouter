// Connection-record precedence in the connector classifier: a live-verified verdict still wins, a
// held "connected" record reads Connected, a "revocation_pending" record reads Disconnecting, and any
// other case (including a "revoked" record or no record) falls through to configuration-only status
// unchanged.

import { describe, expect, it } from "vitest";

import { CONNECTORS } from "@/lib/connections/connector-catalog";
import {
  buildConnectionView,
  classifyConnector,
} from "@/lib/connections/connection-status";

const rentvine = CONNECTORS.find((connector) => connector.id === "rentvine")!;
const configuredPresence = {
  RENTVINE_API_BASE_URL: true,
  RENTVINE_API_KEY: true,
  RENTVINE_API_SECRET: true,
};

describe("classifyConnector with a connection record", () => {
  it("reads Connected with an Admin-set detail when a connected record exists", () => {
    const status = classifyConnector(rentvine, {}, false, { status: "connected" });
    expect(status.state).toBe("connected");
    expect(status.label).toBe("Connected");
    expect(status.detail).toBe("Set up by an Admin.");
  });

  it("reads Disconnecting for a revocation_pending record", () => {
    const status = classifyConnector(rentvine, configuredPresence, false, {
      status: "revocation_pending",
    });
    expect(status.state).toBe("action");
    expect(status.label).toBe("Disconnecting");
  });

  it("lets a passed live-verified verdict win over a connected record", () => {
    const status = classifyConnector(rentvine, {}, true, { status: "connected" });
    expect(status.detail).toBe("Verified and ready.");
  });

  it("falls through to configuration-only status for a revoked record", () => {
    const withRecord = classifyConnector(rentvine, configuredPresence, false, {
      status: "revoked",
    });
    const withoutRecord = classifyConnector(rentvine, configuredPresence);
    expect(withRecord).toEqual(withoutRecord);
    expect(withRecord.label).toBe("Ready to verify");
  });

  it("is byte-identical to the no-record path when no connection is passed", () => {
    expect(classifyConnector(rentvine, configuredPresence, false, undefined)).toEqual(
      classifyConnector(rentvine, configuredPresence),
    );
    expect(classifyConnector(rentvine, {})).toEqual(
      classifyConnector(rentvine, {}, false),
    );
  });
});

describe("buildConnectionView with connection records", () => {
  it("attaches the record status to the matching connector view and counts it Connected", () => {
    const view = buildConnectionView(
      {},
      new Set(),
      new Map([["rentvine", { status: "connected" as const }]]),
    );
    const rentvineItem = view.items.find((item) => item.def.id === "rentvine")!;
    expect(rentvineItem.connection).toEqual({ status: "connected" });
    expect(rentvineItem.status.state).toBe("connected");
    expect(view.summary.connected).toBeGreaterThan(0);
  });

  it("leaves connectors without a record with no connection field", () => {
    const view = buildConnectionView({});
    for (const item of view.items) {
      expect(item.connection).toBeUndefined();
    }
  });
});
