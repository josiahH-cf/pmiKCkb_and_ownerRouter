import { describe, expect, it } from "vitest";

import type { CreateActionRegistryInput } from "@/lib/firestore/schemas";
import {
  ActionNotExecutableError,
  assertActionExecutable,
  isActionExecutable,
} from "@/lib/integrations/action-gate";
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";

const GMAIL_KEY = "gmail.renewal_notice.draft_create";

function seedEntry(key: string): CreateActionRegistryInput {
  const entry = ACTION_REGISTRY_SEED.find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`seed entry ${key} missing`);
  return entry;
}

describe("action-gate", () => {
  it("refuses every seeded entry today (all production_allowed:false)", () => {
    expect(isActionExecutable(GMAIL_KEY)).toBe(false);
    expect(() => assertActionExecutable(GMAIL_KEY)).toThrow(ActionNotExecutableError);
  });

  it("returns false for an unknown key (never throws on lookup)", () => {
    expect(isActionExecutable("does.not.exist")).toBe(false);
  });

  it("opens the gate ONLY for an Approved+Documented entry, via the test seam (seed untouched)", () => {
    const flipped: CreateActionRegistryInput[] = [
      {
        ...seedEntry(GMAIL_KEY),
        readiness: "Approved for Execution",
        evidence_status: "Documented",
        documented_evidence:
          "Committed DWD grant artifact (SA client id + authorized scopes).",
        production_allowed: true,
      },
    ];
    expect(isActionExecutable(GMAIL_KEY, flipped)).toBe(true);
    // The real committed seed is unchanged — the default path stays gated.
    expect(isActionExecutable(GMAIL_KEY)).toBe(false);
  });

  it("cannot be opened by flipping production_allowed alone (schema enforces Approved+Documented)", () => {
    const sneaky: CreateActionRegistryInput[] = [
      { ...seedEntry(GMAIL_KEY), production_allowed: true }, // readiness stays "Planned"
    ];
    expect(() => isActionExecutable(GMAIL_KEY, sneaky)).toThrow();
  });
});
