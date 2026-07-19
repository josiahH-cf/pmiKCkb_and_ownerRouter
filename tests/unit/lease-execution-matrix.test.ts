import { describe, expect, it } from "vitest";

import { EXECUTION_ACTION_POLICIES } from "@/lib/execution/risk-policy";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  LEASE_EXECUTION_ACTIONS,
  LEASE_EXECUTION_DEFINITION_MAP,
  LEASE_EXECUTION_DEFINITIONS,
} from "@/lib/lease-renewal/execution/matrix";

describe("Lease execution matrix", () => {
  it("exposes every R02 group with risk, dependency, correction, and closed registry", () => {
    expect(new Set(LEASE_EXECUTION_DEFINITIONS.map((entry) => entry.group))).toEqual(
      new Set([
        "Gmail renewal",
        "Sheet writeback",
        "Rentvine renewal",
        "Dotloop",
        "Portal chat",
        "SMS",
        "Boom",
      ]),
    );
    expect(LEASE_EXECUTION_DEFINITIONS.map((entry) => entry.key)).toEqual(
      LEASE_EXECUTION_ACTIONS,
    );
    for (const definition of LEASE_EXECUTION_DEFINITIONS) {
      expect(definition.correction).toBeTruthy();
      expect(EXECUTION_ACTION_POLICIES).toHaveProperty(definition.key);
      const policy =
        EXECUTION_ACTION_POLICIES[
          definition.key as keyof typeof EXECUTION_ACTION_POLICIES
        ];
      expect(definition.risk, `${definition.key} must use the S20 risk floor`).toBe(
        policy.defaultRisk,
      );
      const entry = ACTION_REGISTRY_SEED.find(
        (candidate) => candidate.key === definition.key,
      );
      expect(entry).toBeDefined();
      // gmail.renewal_notice.draft_create was authorized for production by the 2026-07-19 owner grant
      // (F-SEND-AUTHORIZED); the rest of the R02 matrix stays registry-closed.
      if (
        ![
          "gmail.thread.reply",
          "gmail.label.apply",
          "gmail.renewal_notice.draft_create",
        ].includes(definition.key)
      ) {
        expect(entry?.production_allowed).toBe(false);
      }
    }
  });

  it("keeps the canonical order topological and completes Dotloop before Rentvine", () => {
    const positions = new Map<string, number>(
      LEASE_EXECUTION_ACTIONS.map((key, index) => [key, index] as const),
    );
    for (const definition of LEASE_EXECUTION_DEFINITIONS) {
      for (const dependency of definition.dependsOn) {
        expect(
          positions.get(dependency),
          `${definition.key} dependency ${dependency} must be in the matrix`,
        ).toBeDefined();
        expect(
          positions.get(dependency)!,
          `${dependency} must precede ${definition.key}`,
        ).toBeLessThan(positions.get(definition.key)!);
      }
    }

    expect(positions.get("dotloop.document.upload")!).toBeLessThan(
      positions.get("rentvine.lease.renewal_writeback")!,
    );
    expect(
      LEASE_EXECUTION_DEFINITION_MAP.get("rentvine.lease.renewal_writeback")?.dependsOn,
    ).toEqual(["dotloop.document.upload"]);
  });

  it("keeps portal and SMS as independently confirmable channel siblings", () => {
    const portal = LEASE_EXECUTION_DEFINITION_MAP.get(
      "rentvine.renewal.portal_message.send",
    );
    const sms = LEASE_EXECUTION_DEFINITION_MAP.get("sms.renewal_message.send");

    expect(portal?.dependsOn).toEqual([]);
    expect(sms?.dependsOn).toEqual([]);
    expect(portal?.dependsOn).not.toContain("gmail.renewal_notice.send");
    expect(sms?.dependsOn).not.toContain("gmail.renewal_notice.send");
  });
});
