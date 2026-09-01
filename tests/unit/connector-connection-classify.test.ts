// Connection-record precedence in the connector classifier: a live-verified verdict still wins, a
// held "connected" record reads Connected, a "revocation_pending" record reads Disconnecting, and any
// other case (including a "revoked" record or no record) falls through to configuration-only status
// unchanged.

import { describe, expect, it } from "vitest";

import { CONNECTORS } from "@/lib/connections/connector-catalog";
import {
  buildConnectionView,
  classifyConnector,
  projectConnectorConnection,
} from "@/lib/connections/connection-status";
import type { ConnectorConnectionRecord } from "@/lib/connections/connector-connection";

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
    expect(
      classifyConnector(rentvine, configuredPresence, true, {
        status: "revocation_pending",
      }),
    ).toEqual(status);
  });

  it("lets a passed live-verified verdict win over a connected record", () => {
    const status = classifyConnector(rentvine, {}, true, { status: "connected" });
    expect(status.detail).toBe("Verified and ready.");
  });

  it("keeps a revoked lifecycle visibly disconnected even with configured or verified sources", () => {
    const withRecord = classifyConnector(rentvine, configuredPresence, false, {
      status: "revoked",
    });
    const verified = classifyConnector(rentvine, configuredPresence, true, {
      status: "revoked",
    });
    expect(withRecord.label).toBe("Disconnected");
    expect(verified).toEqual(withRecord);
    expect(withRecord.state).toBe("none");
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

describe("S96 connector lifecycle projection", () => {
  const connectedRecord: ConnectorConnectionRecord = {
    connectorId: "rentvine",
    method: "api_key",
    status: "connected",
    secretRef: "test-only-vault-handle",
    connectedByUid: "admin-1",
    connectedAt: "2026-08-31T10:00:00.000Z",
    updatedAt: "2026-08-31T10:00:00.000Z",
    generationId: "22222222-2222-4222-8222-222222222222",
    revision: 1,
  };

  it("gives an Admin only the bounded versioned disconnect projection", () => {
    const view = projectConnectorConnection(connectedRecord, true);
    expect(view).toEqual({
      status: "connected",
      disconnect: {
        state: "connected",
        record_version: "g:22222222-2222-4222-8222-222222222222:1",
        recovery_available: true,
      },
    });
    expect(JSON.stringify(view)).not.toContain(connectedRecord.secretRef);
  });

  it("omits version, operation, receipt, and recovery from a non-Admin projection", () => {
    expect(projectConnectorConnection(connectedRecord, false)).toEqual({
      status: "connected",
    });
  });

  it("classifies only a safely recoverable legacy pending record as adoptable", () => {
    const legacy: ConnectorConnectionRecord = {
      connectorId: "rentvine",
      method: "api_key",
      status: "revocation_pending",
      secretRef: "test-only-vault-handle",
      connectedByUid: "admin-1",
      connectedAt: "2026-08-30T10:00:00.000Z",
      updatedAt: "2026-08-31T10:00:00.000Z",
    };
    expect(projectConnectorConnection(legacy, true).disconnect).toMatchObject({
      state: "legacy_pending",
      record_version: "legacy:2026-08-31T10:00:00.000Z",
      recovery_available: true,
    });
    const malformed = { ...legacy, updatedAt: "not-an-iso-time" };
    expect(
      projectConnectorConnection(malformed as ConnectorConnectionRecord, true).disconnect,
    ).toMatchObject({ record_version: null, recovery_available: false });
  });

  it("fails closed for malformed versioned pending and revoked records", () => {
    const malformedPending = {
      ...connectedRecord,
      status: "revocation_pending",
      revision: 2,
      requestedByUid: "admin-1",
      requestedAt: "2026-08-31T11:00:00.000Z",
      updatedAt: "2026-08-31T11:00:00.000Z",
    } as unknown as ConnectorConnectionRecord;
    expect(projectConnectorConnection(malformedPending, true).disconnect).toMatchObject({
      state: "revocation_pending",
      recovery_available: false,
    });

    const malformedRevoked = {
      connectorId: "rentvine",
      method: "api_key",
      status: "revoked",
      generationId: "22222222-2222-4222-8222-222222222222",
      revision: 3,
      operationId: "11111111-1111-4111-8111-111111111111",
      requestedByUid: "admin-1",
      requestedAt: "2026-08-31T11:00:00.000Z",
      completedAt: "not-an-iso-time",
      destroyOutcome: "destroyed",
      updatedAt: "2026-08-31T12:00:00.000Z",
    } as unknown as ConnectorConnectionRecord;
    expect(projectConnectorConnection(malformedRevoked, true).disconnect).toMatchObject({
      state: "manual_blocker",
      recovery_available: false,
    });
  });
});
