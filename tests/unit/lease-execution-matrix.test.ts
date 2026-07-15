import { describe, expect, it } from "vitest";

import { EXECUTION_ACTION_POLICIES } from "@/lib/execution/risk-policy";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
import {
  LEASE_EXECUTION_ACTIONS,
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
      const entry = ACTION_REGISTRY_SEED.find(
        (candidate) => candidate.key === definition.key,
      );
      expect(entry).toBeDefined();
      if (!["gmail.thread.reply", "gmail.label.apply"].includes(definition.key)) {
        expect(entry?.production_allowed).toBe(false);
      }
    }
  });
});
